#!/usr/bin/env node
// Porta nel repo quello che il backend ha raccolto: i prezzi finiscono in
// data/places.json, le segnalazioni in data/feedback.json.
//
//   API_BASE=https://... ADMIN_TOKEN=... npm run sync:backend
//
// Perché passare dal repo invece di leggere il backend a ogni visita: il sito
// resta veloce e funziona anche se il Worker è giù, i dati sono versionati (si
// vede chi ha cambiato cosa e si torna indietro), e chi sviluppa può leggere le
// segnalazioni senza che nessuno gliele inoltri.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLACES = join(ROOT, 'data', 'places.json');
const FEEDBACK = join(ROOT, 'data', 'feedback.json');

const API_BASE = (process.env.API_BASE ?? '').replace(/\/+$/, '');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';

if (!API_BASE) {
  process.stderr.write('API_BASE non impostato: niente da sincronizzare.\n');
  process.exit(0);
}

const log = (line) => process.stderr.write(`${line}\n`);

async function getJson(path, headers = {}) {
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${path}`);
  return res.json();
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/* ------------------------------------------------------------ prezzi */

const { prices } = await getJson('/api/prices?limit=20000');
log(`${prices.length} prezzi dal backend`);

const doc = JSON.parse(await readFile(PLACES, 'utf8'));
const byPlace = new Map();
for (const price of prices) {
  if (!byPlace.has(price.placeId)) byPlace.set(price.placeId, []);
  byPlace.get(price.placeId).push({
    item: price.item ?? undefined,
    dish: price.dish ?? undefined,
    amount: price.amount,
    currency: price.currency,
    by: price.by ?? 'anon',
    date: price.date,
  });
}

let touched = 0;
let orphans = 0;
const known = new Set(doc.places.map((p) => p.id));
for (const placeId of byPlace.keys()) if (!known.has(placeId)) orphans += 1;

for (const place of doc.places) {
  const collected = byPlace.get(place.id);
  if (!collected) {
    // il backend è la verità sui prezzi condivisi: se non ne ha più, si tolgono
    if (place.community?.prices?.length) delete place.community;
    continue;
  }
  collected.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const amounts = collected.map((p) => p.amount);
  place.community = {
    prices: collected,
    medianPrice: Number(median(amounts).toFixed(2)),
    ratings: place.community?.ratings ?? [],
    avgRating: place.community?.avgRating ?? null,
  };
  touched += 1;
}

/* --------------------------------------------------------- fatti segnalati */

const { flags } = await getJson('/api/flags?limit=20000');
log(`${flags.length} fatti segnalati dal backend`);

const flagsByPlace = new Map();
for (const f of flags) {
  if (!flagsByPlace.has(f.placeId)) flagsByPlace.set(f.placeId, []);
  flagsByPlace.get(f.placeId).push({ flag: f.flag, value: f.value, note: f.note ?? undefined, by: f.by ?? 'anon', date: f.date });
}

for (const place of doc.places) {
  const reports = flagsByPlace.get(place.id);
  if (reports) place.flagReports = reports;
  else if (place.flagReports) delete place.flagReports;
}

doc.updatedAt = new Date().toISOString().slice(0, 10);
await writeFile(PLACES, `${JSON.stringify(doc, null, 2)}\n`);
log(`${touched} locali aggiornati${orphans ? `, ${orphans} prezzi per locali non nel dataset (rinominati o spariti da OSM)` : ''}`);

/* -------------------------------------------------------- segnalazioni */

if (!ADMIN_TOKEN) {
  log('ADMIN_TOKEN non impostato: segnalazioni non scaricate.');
  process.exit(0);
}

const { feedback } = await getJson('/api/feedback?limit=1000', { Authorization: `Bearer ${ADMIN_TOKEN}` });
await writeFile(
  FEEDBACK,
  `${JSON.stringify({ updatedAt: new Date().toISOString(), count: feedback.length, feedback }, null, 2)}\n`,
);
process.stdout.write(`Sincronizzati ${prices.length} prezzi e ${feedback.length} segnalazioni.\n`);
