#!/usr/bin/env node
// Arricchisce data/places.json con voto, numero di recensioni e fascia di prezzo
// prese dalla Google Places API (New). Facoltativo: serve una API key.
//
//   GOOGLE_MAPS_API_KEY=xxx npm run enrich:google -- --limit 200
//
// Perché l'API e non lo scraping di Google Maps:
//  - lo scraping delle pagine di Maps viola i ToS di Google e si rompe di continuo;
//  - l'API restituisce comunque solo priceLevel (una fascia $..$$$$), MAI i prezzi
//    dei singoli piatti. I prezzi reali li mettono gli utenti dal sito.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'data', 'places.json');
const KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!KEY) {
  process.stderr.write('Manca GOOGLE_MAPS_API_KEY. Crea una chiave su https://console.cloud.google.com/ e abilita "Places API (New)".\n');
  process.exit(1);
}

const args = process.argv.slice(2);
const limit = Number(args[args.indexOf('--limit') + 1]) || Infinity;
const refreshDays = Number(args[args.indexOf('--max-age') + 1]) || 30;

const PRICE_LEVELS = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/** Distanza in metri, per scartare i match sbagliati. */
function haversine(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function searchText(place) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.priceLevel',
    },
    body: JSON.stringify({
      textQuery: `${place.name} ${place.address ?? 'Amsterdam'}`,
      languageCode: 'en',
      maxResultCount: 5,
      locationBias: { circle: { center: { latitude: place.lat, longitude: place.lon }, radius: 300 } },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).places ?? [];
}

const doc = JSON.parse(await readFile(FILE, 'utf8'));
const cutoff = Date.now() - refreshDays * 864e5;
const todo = doc.places.filter((p) => !p.google?.fetchedAt || Date.parse(p.google.fetchedAt) < cutoff).slice(0, limit);

process.stdout.write(`${todo.length} locali da arricchire (su ${doc.places.length}).\n`);

let matched = 0;
for (const [i, place] of todo.entries()) {
  try {
    const results = await searchText(place);
    const best = results
      .map((r) => ({ r, d: haversine(place, { lat: r.location.latitude, lon: r.location.longitude }) }))
      .filter((x) => x.d < 200)
      .sort((a, b) => a.d - b.d)[0];

    place.google = best
      ? {
          placeId: best.r.id,
          name: best.r.displayName?.text ?? null,
          rating: best.r.rating ?? null,
          reviews: best.r.userRatingCount ?? null,
          priceLevel: PRICE_LEVELS[best.r.priceLevel] ?? null,
          distanceM: Math.round(best.d),
          fetchedAt: new Date().toISOString(),
        }
      : { placeId: null, fetchedAt: new Date().toISOString() };

    if (best) matched += 1;
  } catch (err) {
    process.stderr.write(`! ${place.name}: ${err.message}\n`);
  }
  if ((i + 1) % 25 === 0) process.stdout.write(`  ${i + 1}/${todo.length}\n`);
  await new Promise((r) => setTimeout(r, 120)); // gentile con la quota
}

doc.updatedAt = new Date().toISOString().slice(0, 10);
await writeFile(FILE, `${JSON.stringify(doc, null, 2)}\n`);
process.stdout.write(`Abbinati ${matched}/${todo.length} locali a una scheda Google.\n`);
