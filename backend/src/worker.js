// API dei prezzi condivisi e delle segnalazioni (Cloudflare Worker + D1).
//
// Principi:
//  - i prezzi si aggiungono, non si aggiornano: lo storico è il dato;
//  - niente account: un identificativo casuale del browser basta per il rate
//    limit, e chiedere una registrazione per dire "il döner costa 7,50"
//    significa non ricevere nessun prezzo;
//  - la moderazione nasconde, non cancella (hidden = 1), così un errore si
//    ripara e resta traccia.
//
// I limiti di plausibilità sono gli stessi che usa lo scraper: un solo posto in
// cui sono definiti, così non possono divergere.
import { PLAUSIBLE } from '../../scripts/menu-parse.js';

// Derivate dai limiti invece che riscritte: un elenco a parte prima o poi
// divergerebbe, e il sito accetterebbe voci che il server rifiuta.
const REFERENCE_ITEMS = new Set(Object.keys(PLAUSIBLE));

const MAX_PER_HOUR = 40;
const MAX_TEXT = 4000;
const WINDOW_MS = 3600_000;

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** Finestra fissa per chiave: semplice, e sufficiente a fermare gli abusi banali. */
async function overRateLimit(env, bucket, now = Date.now()) {
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const row = await env.DB.prepare('SELECT count, window_start FROM rate_limit WHERE bucket = ?')
    .bind(bucket)
    .first();

  if (!row || row.window_start !== windowStart) {
    await env.DB.prepare(
      'INSERT INTO rate_limit (bucket, count, window_start) VALUES (?, 1, ?) ' +
      'ON CONFLICT(bucket) DO UPDATE SET count = 1, window_start = excluded.window_start',
    ).bind(bucket, windowStart).run();
    return false;
  }

  if (row.count >= MAX_PER_HOUR) return true;
  await env.DB.prepare('UPDATE rate_limit SET count = count + 1 WHERE bucket = ?').bind(bucket).run();
  return false;
}

/** Un prezzo fuori scala è quasi sempre un errore di battitura: meglio rifiutarlo subito. */
export function validatePrice(body) {
  const errors = [];
  const placeId = String(body.placeId ?? '').trim();
  if (!placeId || placeId.length > 120) errors.push('placeId mancante o troppo lungo');

  const item = body.item == null || body.item === '' ? null : String(body.item);
  if (item !== null && !REFERENCE_ITEMS.has(item)) errors.push(`item sconosciuto: ${item}`);

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push('amount non è un numero positivo');
  else if (item && PLAUSIBLE[item]) {
    const [min, max] = PLAUSIBLE[item];
    if (amount < min || amount > max) errors.push(`per "${item}" ci aspettiamo fra €${min} e €${max}`);
  } else if (amount > 300) errors.push('amount troppo alto');

  const dish = String(body.dish ?? '').slice(0, 120) || null;
  const reporter = String(body.reporter ?? '').slice(0, 60) || null;

  return {
    errors,
    value: { placeId, item, dish, amount: Math.round(amount * 100) / 100, reporter },
  };
}

const clientKey = (request, body) =>
  String(body?.clientId ?? '').slice(0, 64) || request.headers.get('CF-Connecting-IP') || 'anonimo';

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

async function postPrice(request, env) {
  const body = await readBody(request);
  if (!body) return json({ error: 'corpo della richiesta non valido' }, 400);

  const { errors, value } = validatePrice(body);
  if (errors.length) return json({ error: 'segnalazione rifiutata', details: errors }, 400);

  if (await overRateLimit(env, `price:${clientKey(request, body)}`)) {
    return json({ error: 'troppe segnalazioni in un\'ora, riprova più tardi' }, 429);
  }

  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO prices (place_id, item, dish, amount, currency, reporter, client_id, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    value.placeId, value.item, value.dish, value.amount, 'EUR',
    value.reporter, String(body.clientId ?? '').slice(0, 64) || null, createdAt,
  ).run();

  return json({ ok: true, price: { ...value, createdAt } }, 201);
}

const priceRow = (row) => ({
  placeId: row.place_id,
  item: row.item,
  dish: row.dish,
  amount: row.amount,
  currency: row.currency,
  by: row.reporter,
  date: String(row.created_at).slice(0, 10),
  createdAt: row.created_at,
});

async function getPlacePrices(env, placeId) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM prices WHERE place_id = ? AND hidden = 0 ORDER BY created_at ASC',
  ).bind(placeId).all();
  return json({ placeId, prices: (results ?? []).map(priceRow) });
}

async function getAllPrices(env, url) {
  const since = url.searchParams.get('since');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 5000, 20000);
  const statement = since
    ? env.DB.prepare('SELECT * FROM prices WHERE hidden = 0 AND created_at > ? ORDER BY created_at ASC LIMIT ?').bind(since, limit)
    : env.DB.prepare('SELECT * FROM prices WHERE hidden = 0 ORDER BY created_at ASC LIMIT ?').bind(limit);
  const { results } = await statement.all();
  return json({ count: results?.length ?? 0, prices: (results ?? []).map(priceRow) });
}

async function postFeedback(request, env) {
  const body = await readBody(request);
  if (!body) return json({ error: 'corpo della richiesta non valido' }, 400);

  const text = String(body.text ?? '').trim().slice(0, MAX_TEXT);
  if (!text) return json({ error: 'testo mancante' }, 400);

  if (await overRateLimit(env, `feedback:${clientKey(request, body)}`)) {
    return json({ error: 'troppe segnalazioni in un\'ora, riprova più tardi' }, 429);
  }

  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO feedback (text, context, reporter, client_id, created_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(
    text,
    body.context ? JSON.stringify(body.context).slice(0, 8000) : null,
    String(body.reporter ?? '').slice(0, 60) || null,
    String(body.clientId ?? '').slice(0, 64) || null,
    createdAt,
  ).run();

  return json({ ok: true, createdAt }, 201);
}

/** Le segnalazioni possono contenere dettagli personali: si leggono col token. */
async function getFeedback(request, env, url) {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: 'non autorizzato' }, 401);

  const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 1000);
  const { results } = await env.DB.prepare(
    'SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?',
  ).bind(limit).all();

  return json({
    count: results?.length ?? 0,
    feedback: (results ?? []).map((row) => ({
      id: row.id,
      text: row.text,
      context: row.context ? JSON.parse(row.context) : null,
      by: row.reporter,
      status: row.status,
      createdAt: row.created_at,
    })),
  });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const cors = corsHeaders(request, env);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const withCors = (response) => {
    for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
    return response;
  };

  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/api/health') return withCors(json({ ok: true }));

  if (path === '/api/prices') {
    if (request.method === 'POST') return withCors(await postPrice(request, env));
    if (request.method === 'GET') return withCors(await getAllPrices(env, url));
  }

  const placeMatch = path.match(/^\/api\/prices\/(.+)$/);
  if (placeMatch && request.method === 'GET') {
    return withCors(await getPlacePrices(env, decodeURIComponent(placeMatch[1])));
  }

  if (path === '/api/feedback') {
    if (request.method === 'POST') return withCors(await postFeedback(request, env));
    if (request.method === 'GET') return withCors(await getFeedback(request, env, url));
  }

  return withCors(json({ error: 'not found' }, 404));
}

export default {
  fetch: (request, env) => handleRequest(request, env).catch((err) => json({ error: err.message }, 500)),
};
