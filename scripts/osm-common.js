// Query Overpass + normalizzazione dei tag OSM.
// Condiviso tra lo script Node (scripts/fetch-osm.mjs) e il browser
// (assets/js/sources/osm.js importa la stessa logica via una copia ESM).

// Solo istanze con copertura mondiale: i mirror regionali (per esempio
// overpass.osm.ch, che ha i soli dati svizzeri) rispondono 200 con zero
// risultati per Amsterdam, che è molto peggio di un errore.
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Amsterdam, comune (admin_level 8). Il bbox è un fallback se l'area non risolve.
export const AMSTERDAM_BBOX = [52.278, 4.728, 52.431, 5.068]; // S,W,N,E

export const OVERPASS_QUERY = `
[out:json][timeout:90];
area["boundary"="administrative"]["admin_level"="8"]["name"="Amsterdam"]->.a;
(
  nwr["amenity"~"^(fast_food|restaurant|cafe|ice_cream|food_court)$"](area.a);
);
out center tags;
`.trim();

export const OVERPASS_QUERY_BBOX = `
[out:json][timeout:90];
(
  nwr["amenity"~"^(fast_food|restaurant|cafe|ice_cream|food_court)$"](${AMSTERDAM_BBOX.join(',')});
);
out center tags;
`.trim();

const YES = new Set(['yes', 'only', 'limited']);

function dietValue(tags, key) {
  const v = tags[`diet:${key}`];
  if (!v) return null;
  const value = v.toLowerCase();
  if (value === 'only') return 'only';
  if (YES.has(value)) return 'yes';
  if (value === 'no') return 'no';
  return null;
}

function splitList(value) {
  if (!value) return [];
  return value
    .split(';')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function buildAddress(tags) {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  const city = [tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(' ');
  return [street, city].filter(Boolean).join(', ') || null;
}

/** Converte un elemento Overpass nel formato usato dal sito. */
export function normalizeElement(el) {
  const tags = el.tags || {};
  const name = tags.name || tags['name:en'] || tags.brand;
  if (!name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const vegetarian = dietValue(tags, 'vegetarian');
  const vegan = dietValue(tags, 'vegan');

  return {
    id: `osm:${el.type}/${el.id}`,
    name,
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    category: tags.amenity || 'restaurant',
    cuisines: splitList(tags.cuisine),
    diet: {
      vegetarian,
      vegan,
      // molti locali non taggano diet:* ma sono di fatto veg (falafel, indiano...)
      inferred: inferVegFriendly(splitList(tags.cuisine)) && !vegetarian && !vegan,
    },
    address: buildAddress(tags),
    website: tags.website || tags['contact:website'] || null,
    phone: tags.phone || tags['contact:phone'] || null,
    openingHours: tags.opening_hours || null,
    takeaway: tags.takeaway || null,
    delivery: tags.delivery || null,
    outdoorSeating: tags.outdoor_seating || null,
    wheelchair: tags.wheelchair || null,
    brand: tags.brand || null,
    osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    source: 'osm',
  };
}

const VEG_FRIENDLY_CUISINES = new Set([
  'falafel', 'vegetarian', 'vegan', 'indian', 'lebanese', 'middle_eastern',
  'mediterranean', 'ethiopian', 'thai', 'vietnamese', 'juice', 'salad',
]);

export function inferVegFriendly(cuisines) {
  return cuisines.some((c) => VEG_FRIENDLY_CUISINES.has(c));
}

/** Deduplica e ordina in modo stabile, così i diff su git restano leggibili. */
export function finalize(places) {
  const byId = new Map();
  for (const p of places) if (p) byId.set(p.id, p);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'it') || a.id.localeCompare(b.id));
}
