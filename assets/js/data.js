// Caricamento del dataset e calcolo dei campi derivati (prezzo, voto).
//
// Ordine delle fonti:
//   1. data/places.json committato nel repo (aggiornato dallo script/workflow);
//   2. se manca o è vuoto, interroga Overpass direttamente dal browser e
//      mette in cache il risultato per una settimana in localStorage;
//   3. i locali aggiunti a mano dall'utente si sommano sempre agli altri.

import { OVERPASS_ENDPOINTS, OVERPASS_STRATEGIES, normalizeElement, finalize } from '../../scripts/osm-common.js';
import { store } from './store.js';

const CACHE_KEY = 'eating-amsterdam:osm-cache:v1';
const CACHE_TTL = 7 * 864e5;

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function loadFile() {
  try {
    const res = await fetch('data/places.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const doc = await res.json();
    return Array.isArray(doc.places) && doc.places.length ? doc : null;
  } catch {
    return null;
  }
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (cached && Date.now() - cached.at < CACHE_TTL) return cached.doc;
  } catch { /* cache corrotta: la ignoriamo */ }
  return null;
}

async function loadOverpass({ force = false, onProgress } = {}) {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
  }
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (const { label, query } of OVERPASS_STRATEGIES) {
      try {
        onProgress?.('Scarico i locali da OpenStreetMap…');
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const places = finalize((raw.elements ?? []).map(normalizeElement));
        // una risposta 200 con zero risultati non è un successo: proviamo la strategia dopo
        if (!places.length) continue;

        const doc = { updatedAt: new Date().toISOString().slice(0, 10), source: `OpenStreetMap (ODbL) — live, ${label}`, places };
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), doc }));
        } catch { /* dataset troppo grande per la quota: pazienza */ }
        return doc;
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw lastError ?? new Error('Overpass non raggiungibile');
}

/** Fonde dataset, contributi condivisi e contributi locali in un oggetto pronto per la UI. */
export function decorate(place) {
  const mine = store.get(place.id);
  const community = place.community ?? {};

  const myPrices = mine?.prices ?? [];
  const communityPrices = community.prices ?? [];
  const amounts = [...myPrices, ...communityPrices].map((p) => p.amount).filter(Number.isFinite);

  const price = median(amounts);
  const priceSource = myPrices.length ? 'mine' : communityPrices.length ? 'community' : null;

  const rating = mine?.rating ?? community.avgRating ?? place.google?.rating ?? null;
  const ratingSource = mine?.rating ? 'mine' : community.avgRating ? 'community' : place.google?.rating ? 'google' : null;

  return {
    ...place,
    myPrices,
    communityPrices,
    price,
    priceSource,
    priceLevel: place.google?.priceLevel ?? null,
    rating,
    ratingSource,
    reviews: place.google?.reviews ?? null,
    note: mine?.note ?? '',
    favorite: Boolean(mine?.favorite),
  };
}

/** Restituisce i locali "grezzi": i campi derivati li calcola poi `decorate`. */
export async function loadPlaces({ force = false, onProgress } = {}) {
  let doc = force ? null : await loadFile();
  if (!doc) doc = await loadOverpass({ force, onProgress });
  return { updatedAt: doc.updatedAt, source: doc.source, places: doc.places };
}

export function priceBand(price) {
  if (price == null) return 'unknown';
  if (price <= 10) return 'cheap';
  if (price <= 18) return 'mid';
  return 'pricey';
}
