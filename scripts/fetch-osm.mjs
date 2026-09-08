#!/usr/bin/env node
// Scarica da OpenStreetMap (Overpass) tutti i locali di Amsterdam e scrive data/places.json.
//   npm run fetch:osm
// Nessuna API key, nessun costo, dati sotto licenza ODbL.

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  OVERPASS_ENDPOINTS, OVERPASS_QUERY, OVERPASS_QUERY_BBOX, normalizeElement, finalize,
} from './osm-common.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'places.json');

async function overpass(query) {
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      process.stderr.write(`→ ${endpoint}\n`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      process.stderr.write(`  fallito: ${err.message}\n`);
    }
  }
  throw lastError;
}

/** Riporta i prezzi/voti già presenti nel file, che non arrivano da OSM. */
async function keepLocalFields(places) {
  let previous = [];
  try {
    previous = JSON.parse(await readFile(OUT, 'utf8')).places ?? [];
  } catch {
    return places;
  }
  const old = new Map(previous.map((p) => [p.id, p]));
  return places.map((p) => {
    const before = old.get(p.id);
    if (!before) return p;
    return { ...p, google: before.google ?? undefined, community: before.community ?? undefined };
  });
}

const raw = await overpass(OVERPASS_QUERY).catch(() => {
  process.stderr.write('Area "Amsterdam" non risolta, riprovo con il bounding box.\n');
  return overpass(OVERPASS_QUERY_BBOX);
});

const places = await keepLocalFields(finalize((raw.elements ?? []).map(normalizeElement)));

await writeFile(
  OUT,
  `${JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), source: 'OpenStreetMap (ODbL)', places }, null, 2)}\n`,
);

const withVeg = places.filter((p) => p.diet.vegetarian || p.diet.vegan).length;
process.stdout.write(`Scritti ${places.length} locali in data/places.json (${withVeg} con tag diet:* espliciti).\n`);
