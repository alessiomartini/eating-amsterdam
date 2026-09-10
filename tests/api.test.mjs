// Il Worker gira su Cloudflare D1, che qui non c'è. Ma D1 è SQLite con
// un'interfaccia sottile sopra: con node:sqlite si prova l'API per davvero,
// SQL compreso, senza dipendere da un deploy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleRequest, validatePrice } from '../backend/src/worker.js';

const SCHEMA = readFileSync(new URL('../backend/schema.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://alessiomartini.github.io';

/** Imita l'interfaccia di D1 sopra node:sqlite. */
class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() { this.db.prepare(this.sql).run(...this.args); return { success: true }; }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
}

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return {
    DB: { prepare: (sql) => new Statement(db, sql) },
    ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173`,
    ADMIN_TOKEN: 'segreto-di-prova',
    _db: db,
  };
}

const post = (path, body, headers = {}) =>
  new Request(`https://api.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });

const get = (path, headers = {}) =>
  new Request(`https://api.example${path}`, { headers: { Origin: ORIGIN, ...headers } });

test('un prezzo inviato si ritrova', async () => {
  const env = makeEnv();
  const created = await handleRequest(post('/api/prices', {
    placeId: 'osm:node/1', item: 'doner', amount: 7.5, reporter: 'alessio', clientId: 'abc',
  }), env);
  assert.equal(created.status, 201);

  const read = await handleRequest(get('/api/prices/osm%3Anode%2F1'), env);
  const body = await read.json();
  assert.equal(body.prices.length, 1);
  assert.equal(body.prices[0].amount, 7.5);
  assert.equal(body.prices[0].by, 'alessio');
  assert.equal(body.prices[0].item, 'doner');
});

test('lo storico torna in ordine di tempo', async () => {
  const env = makeEnv();
  for (const amount of [7, 7.5, 19]) {
    await handleRequest(post('/api/prices', { placeId: 'p', item: 'doner', amount, clientId: 'x' }), env);
  }
  const body = await (await handleRequest(get('/api/prices/p'), env)).json();
  assert.deepEqual(body.prices.map((p) => p.amount), [7, 7.5, 19]);
});

test('rifiuta i prezzi implausibili e le voci sconosciute', async () => {
  const env = makeEnv();
  const tooMuch = await handleRequest(post('/api/prices', { placeId: 'p', item: 'coffee', amount: 45, clientId: 'x' }), env);
  assert.equal(tooMuch.status, 400, 'un caffè a 45 € è un errore di battitura');

  const unknown = await handleRequest(post('/api/prices', { placeId: 'p', item: 'caviale', amount: 5, clientId: 'x' }), env);
  assert.equal(unknown.status, 400);

  const negative = await handleRequest(post('/api/prices', { placeId: 'p', item: 'beer', amount: -3, clientId: 'x' }), env);
  assert.equal(negative.status, 400);
});

test('il rate limit ferma gli invii ripetuti', async () => {
  const env = makeEnv();
  let last;
  for (let i = 0; i < 45; i += 1) {
    last = await handleRequest(post('/api/prices', { placeId: `p${i}`, item: 'beer', amount: 5, clientId: 'stesso' }), env);
  }
  assert.equal(last.status, 429);

  // un altro browser non deve essere penalizzato
  const other = await handleRequest(post('/api/prices', { placeId: 'p', item: 'beer', amount: 5, clientId: 'altro' }), env);
  assert.equal(other.status, 201);
});

test('le segnalazioni si scrivono senza token e si leggono solo col token', async () => {
  const env = makeEnv();
  const sent = await handleRequest(post('/api/feedback', {
    text: 'Manca il Kriterion', context: { results: 12 }, clientId: 'x',
  }), env);
  assert.equal(sent.status, 201);

  const denied = await handleRequest(get('/api/feedback'), env);
  assert.equal(denied.status, 401);

  const allowed = await handleRequest(get('/api/feedback', { Authorization: 'Bearer segreto-di-prova' }), env);
  const body = await allowed.json();
  assert.equal(body.feedback[0].text, 'Manca il Kriterion');
  assert.deepEqual(body.feedback[0].context, { results: 12 });
});

test('i prezzi nascosti dalla moderazione non escono', async () => {
  const env = makeEnv();
  await handleRequest(post('/api/prices', { placeId: 'p', item: 'beer', amount: 5, clientId: 'x' }), env);
  env._db.exec('UPDATE prices SET hidden = 1');
  const body = await (await handleRequest(get('/api/prices/p'), env)).json();
  assert.equal(body.prices.length, 0);
});

test('CORS aperto solo alle origini previste', async () => {
  const env = makeEnv();
  const ok = await handleRequest(get('/api/health'), env);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);

  const stranger = await handleRequest(
    new Request('https://api.example/api/health', { headers: { Origin: 'https://spam.example' } }),
    env,
  );
  assert.equal(stranger.headers.get('Access-Control-Allow-Origin'), null);
});

test('la sincronizzazione può chiedere solo le novità', async () => {
  const env = makeEnv();
  await handleRequest(post('/api/prices', { placeId: 'p', item: 'beer', amount: 5, clientId: 'x' }), env);
  const future = new Date(Date.now() + 60_000).toISOString();
  const body = await (await handleRequest(get(`/api/prices?since=${future}`), env)).json();
  assert.equal(body.count, 0);

  const past = new Date(Date.now() - 60_000).toISOString();
  const all = await (await handleRequest(get(`/api/prices?since=${past}`), env)).json();
  assert.equal(all.count, 1);
});

test('un corpo non valido non fa esplodere niente', async () => {
  const env = makeEnv();
  const bad = new Request('https://api.example/api/prices', {
    method: 'POST', headers: { Origin: ORIGIN }, body: 'non è json',
  });
  assert.equal((await handleRequest(bad, env)).status, 400);
  assert.equal((await handleRequest(get('/api/inesistente'), env)).status, 404);
});

test('la validazione arrotonda ai centesimi', () => {
  const { value, errors } = validatePrice({ placeId: 'p', item: 'beer', amount: 5.239 });
  assert.deepEqual(errors, []);
  assert.equal(value.amount, 5.24);
});

/* --- lettura dell'output di wrangler, usata dalla procedura automatica --- */

test('trova il database_id in tutti i formati che wrangler produce', async () => {
  const { extractDatabaseId, extractWorkerUrl } = await import('../backend/parse-wrangler.js');
  const id = '12345678-90ab-cdef-1234-567890abcdef';

  assert.equal(extractDatabaseId(JSON.stringify({ uuid: id, name: 'x' })), id);
  assert.equal(extractDatabaseId(JSON.stringify({ d1_databases: [{ database_id: id }] })), id);
  assert.equal(extractDatabaseId(`✅ Successfully created DB!\n  database_id = "${id}"`), id);
  assert.equal(extractDatabaseId('nessun identificatore qui'), null, 'meglio fermarsi che inventare un id');

  assert.equal(
    extractWorkerUrl('Published eating-amsterdam-api\n  https://eating-amsterdam-api.tizio.workers.dev'),
    'https://eating-amsterdam-api.tizio.workers.dev',
  );
  assert.equal(extractWorkerUrl('deploy fallito'), null);
});
