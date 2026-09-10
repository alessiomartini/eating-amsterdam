// Dialogo col backend condiviso (Cloudflare Worker + D1).
//
// Offline-first per necessità: questo sito si usa per strada, col telefono, in
// un seminterrato dove il döner è buono e il segnale no. Un prezzo inserito si
// salva sempre in locale; l'invio al server è un tentativo che, se fallisce,
// resta in coda e riparte al caricamento successivo.
//
// Finché data/config.json non ha un apiBase, tutto continua a funzionare come
// prima: i contributi restano nel browser.

import { store } from './store.js';

const OUTBOX_KEY = 'eating-amsterdam:outbox:v1';
const CLIENT_KEY = 'eating-amsterdam:client:v1';

let apiBase = null;

/** Identificativo casuale del browser: serve al rate limit, non identifica nessuno. */
export function clientId() {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? String(Math.random()).slice(2)).replace(/-/g, '').slice(0, 24);
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return 'anonimo';
  }
}

export const isOnline = () => Boolean(apiBase);

export async function initApi() {
  try {
    const res = await fetch('data/config.json', { cache: 'no-cache' });
    if (res.ok) apiBase = (await res.json()).apiBase || null;
  } catch { /* nessuna configurazione: si resta in locale */ }
  if (apiBase) flushOutbox();
  return apiBase;
}

/* ------------------------------------------------------------------ coda */

const readOutbox = () => {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]');
  } catch {
    return [];
  }
};

const writeOutbox = (items) => {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items.slice(-200)));
  } catch { /* quota piena */ }
};

function enqueue(path, payload) {
  writeOutbox([...readOutbox(), { path, payload, at: Date.now() }]);
}

async function send(path, payload) {
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, clientId: clientId() }),
  });
  // 4xx significa che il server ha capito e ha detto no: rimandarlo non aiuta
  if (!res.ok && res.status >= 500) throw new Error(`HTTP ${res.status}`);
  return res;
}

/** Svuota la coda: quello che non parte resta per il prossimo tentativo. */
export async function flushOutbox() {
  if (!apiBase) return { sent: 0, left: readOutbox().length };
  const queue = readOutbox();
  if (!queue.length) return { sent: 0, left: 0 };

  const left = [];
  let sent = 0;
  for (const entry of queue) {
    try {
      await send(entry.path, entry.payload);
      sent += 1;
    } catch {
      left.push(entry);
    }
  }
  writeOutbox(left);
  return { sent, left: left.length };
}

/* --------------------------------------------------------------- scrittura */

/** @returns 'sent' | 'queued' | 'local' | 'rejected' */
export async function submitPrice({ placeId, item, dish, amount }) {
  if (!apiBase) return 'local';
  const payload = { placeId, item, dish, amount, reporter: store.all().author || null };
  try {
    const res = await send('/api/prices', payload);
    if (res.ok) return 'sent';
    return 'rejected';
  } catch {
    enqueue('/api/prices', payload);
    return 'queued';
  }
}

export async function submitFeedback({ text, context }) {
  if (!apiBase) return 'local';
  const payload = { text, context, reporter: store.all().author || null };
  try {
    const res = await send('/api/feedback', payload);
    if (res.ok) return 'sent';
    return 'rejected';
  } catch {
    enqueue('/api/feedback', payload);
    return 'queued';
  }
}

/* ---------------------------------------------------------------- lettura */

/** I prezzi condivisi di un locale, per vedere subito quelli arrivati dopo l'ultima sincronizzazione. */
export async function fetchPlacePrices(placeId) {
  if (!apiBase) return null;
  try {
    const res = await fetch(`${apiBase}/api/prices/${encodeURIComponent(placeId)}`);
    if (!res.ok) return null;
    return (await res.json()).prices ?? [];
  } catch {
    return null;
  }
}
