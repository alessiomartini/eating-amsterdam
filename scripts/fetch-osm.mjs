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

// Overpass rifiuta con 406 le richieste senza User-Agent riconoscibile.
const USER_AGENT = 'eating-amsterdam/0.1 (+https://github.com/alessiomartini/eating-amsterdam)';
const RETRY_STATUS = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (line) => process.stderr.write(`${line}\n`);

async function post(endpoint, query) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

/** Prova ogni endpoint, con backoff sugli errori temporanei (429 = rate limit). */
async function overpass(query) {
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        log(`→ ${endpoint} (tentativo ${attempt})`);
        const json = await post(endpoint, query);
        // Overpass segnala i suoi errori anche dentro una risposta 200.
        if (json.remark) log(`  remark: ${json.remark}`);
        return json;
      } catch (err) {
        lastError = err;
        log(`  fallito: ${err.message}`);
        if (!RETRY_STATUS.has(err.status) || attempt === MAX_ATTEMPTS) break;
        const wait = 2 ** attempt * 1000;
        log(`  riprovo tra ${wait / 1000}s`);
        await sleep(wait);
      }
    }
  }
  throw lastError ?? new Error('nessun endpoint Overpass disponibile');
}

/**
 * L'area amministrativa è più precisa, il bounding box più robusto: se la prima
 * non risolve, Overpass risponde 200 con zero elementi invece di un errore, quindi
 * il fallback deve scattare sul risultato vuoto, non solo su un'eccezione.
 */
async function fetchPlaces() {
  const strategies = [
    ['area amministrativa di Amsterdam', OVERPASS_QUERY],
    ['bounding box di Amsterdam', OVERPASS_QUERY_BBOX],
  ];

  for (const [label, query] of strategies) {
    log(`Strategia: ${label}`);
    let raw;
    try {
      raw = await overpass(query);
    } catch (err) {
      log(`  strategia fallita: ${err.message}`);
      continue;
    }
    const elements = raw.elements ?? [];
    const places = finalize(elements.map(normalizeElement));
    log(`  ${elements.length} elementi grezzi → ${places.length} locali con nome e posizione`);
    if (places.length) return places;
    log('  nessun locale, passo alla strategia successiva');
  }

  throw new Error(
    'Overpass non ha restituito alcun locale con nessuna strategia. ' +
    'data/places.json NON è stato toccato: meglio dati vecchi che dati vuoti.',
  );
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

const places = await keepLocalFields(await fetchPlaces());

await writeFile(
  OUT,
  `${JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), source: 'OpenStreetMap (ODbL)', places }, null, 2)}\n`,
);

const withVeg = places.filter((p) => p.diet.vegetarian || p.diet.vegan).length;
process.stdout.write(`Scritti ${places.length} locali in data/places.json (${withVeg} con tag diet:* espliciti).\n`);
