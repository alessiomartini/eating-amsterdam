#!/usr/bin/env node
// Unisce in data/places.json i contributi esportati dal sito (bottone "Esporta i miei dati").
//
//   npm run merge:contributions -- contributi-di-alessio.json
//
// Ogni prezzo tiene traccia di chi l'ha inserito e quando, così si può
// ricalcolare la mediana e buttare via i dati vecchi.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'data', 'places.json');

const input = process.argv[2];
if (!input) {
  process.stderr.write('Uso: npm run merge:contributions -- <file-esportato.json>\n');
  process.exit(1);
}

const doc = JSON.parse(await readFile(FILE, 'utf8'));
const incoming = JSON.parse(await readFile(input, 'utf8'));
const byId = new Map(doc.places.map((p) => [p.id, p]));

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

let added = 0;
let unknown = 0;

for (const [placeId, entry] of Object.entries(incoming.places ?? {})) {
  const place = byId.get(placeId);
  if (!place) {
    unknown += 1;
    continue;
  }
  const community = place.community ?? { prices: [], ratings: [] };
  const seen = new Set(community.prices.map((p) => `${p.dish}|${p.amount}|${p.by}`));

  for (const price of entry.prices ?? []) {
    const key = `${price.dish}|${price.amount}|${incoming.author ?? 'anon'}`;
    if (seen.has(key)) continue;
    community.prices.push({ ...price, by: incoming.author ?? 'anon' });
    seen.add(key);
    added += 1;
  }
  if (typeof entry.rating === 'number') community.ratings.push({ value: entry.rating, by: incoming.author ?? 'anon' });

  const amounts = community.prices.map((p) => p.amount).filter((n) => Number.isFinite(n));
  community.medianPrice = amounts.length ? Number(median(amounts).toFixed(2)) : null;
  community.avgRating = community.ratings.length
    ? Number((community.ratings.reduce((s, r) => s + r.value, 0) / community.ratings.length).toFixed(2))
    : null;

  place.community = community;
}

await writeFile(FILE, `${JSON.stringify(doc, null, 2)}\n`);
process.stdout.write(`Aggiunti ${added} prezzi. ${unknown ? `${unknown} locali non trovati (custom o dati OSM cambiati).` : ''}\n`);
