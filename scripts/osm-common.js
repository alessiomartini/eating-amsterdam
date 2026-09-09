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

// "Amsterdam e dintorni": il comune più i vicini dove ha senso andare a mangiare
// — Diemen, Amstelveen, Ouder-Amstel/Duivendrecht, Badhoevedorp, il bordo sud di
// Zaandam. Il bounding box è volutamente più largo del confine amministrativo:
// per chi cerca un döner un confine comunale non vuole dire niente.
export const METRO_BBOX = [52.26, 4.72, 52.45, 5.08]; // S,O,N,E

const AMENITIES = '^(fast_food|restaurant|cafe|ice_cream|food_court)$';

// In ordine di preferenza: se la prima non produce nulla si passa alla seconda.
// Il ripiego copre meno zona ma non dipende dall'indice delle aree di Overpass,
// che è la parte più fragile della query.
export const OVERPASS_STRATEGIES = [
  {
    label: 'Amsterdam e dintorni (bounding box)',
    query: `
[out:json][timeout:120];
(
  nwr["amenity"~"${AMENITIES}"](${METRO_BBOX.join(',')});
);
out center tags;
`.trim(),
  },
  {
    label: 'solo comune di Amsterdam (ripiego)',
    query: `
[out:json][timeout:90];
area["boundary"="administrative"]["admin_level"="8"]["name"="Amsterdam"]->.a;
(
  nwr["amenity"~"${AMENITIES}"](area.a);
);
out center tags;
`.trim(),
  },
];

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
