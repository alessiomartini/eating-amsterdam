// Raggruppamento delle cucine OSM in categorie sensate, risoluzione del prezzo
// da mostrare e logica dei filtri.

import { isOpenNow } from './hours.js';
import { REFERENCE_ITEMS } from './items.js';

export const CUISINE_GROUPS = [
  { id: 'kebab', label: '🥙 Döner / kebab', match: ['kebab', 'doner', 'döner', 'turkish', 'shawarma', 'gyros'] },
  { id: 'friet', label: '🍟 Snack bar / fries', match: ['friture', 'chips', 'french_fries', 'fish_and_chips', 'snack', 'snack_bar', 'fries'] },
  { id: 'burger', label: '🍔 Burgers', match: ['burger', 'american', 'hot_dog'] },
  { id: 'pizza', label: '🍕 Pizza / Italian', match: ['pizza', 'italian', 'pasta'] },
  { id: 'asian', label: '🍜 Asian', match: ['chinese', 'thai', 'vietnamese', 'japanese', 'sushi', 'korean', 'asian', 'ramen', 'noodle', 'wok', 'dumpling', 'malaysian', 'filipino'] },
  { id: 'indo', label: '🍛 Indonesian / Surinamese', match: ['indonesian', 'surinamese', 'javanese'] },
  { id: 'indian', label: '🍛 Indian', match: ['indian', 'pakistani', 'nepalese', 'bangladeshi'] },
  { id: 'middle_east', label: '🧆 Falafel / Middle Eastern', match: ['falafel', 'lebanese', 'middle_eastern', 'syrian', 'persian', 'egyptian', 'israeli', 'moroccan'] },
  { id: 'sandwich', label: '🥪 Sandwiches / bagels', match: ['sandwich', 'bagel', 'deli', 'broodjes', 'wrap'] },
  { id: 'mexican', label: '🌮 Mexican / Latin', match: ['mexican', 'tex-mex', 'burrito', 'peruvian', 'brazilian', 'argentinian', 'latin_american'] },
  { id: 'african', label: '🍲 African / Ethiopian', match: ['ethiopian', 'african', 'eritrean', 'senegalese', 'ghanaian'] },
  { id: 'veg', label: '🌱 Veggie / vegan', match: ['vegetarian', 'vegan'] },
  { id: 'sweet', label: '🍩 Sweets / coffee', match: ['coffee_shop', 'coffee', 'cake', 'ice_cream', 'bakery', 'pancake', 'waffle', 'donut', 'stroopwafel', 'crepe'] },
  { id: 'dutch', label: '🇳🇱 Dutch', match: ['dutch', 'herring', 'pannenkoeken'] },
];

const GROUP_BY_CUISINE = new Map();
for (const group of CUISINE_GROUPS) for (const c of group.match) GROUP_BY_CUISINE.set(c, group.id);

export const CATEGORIES = [
  { id: 'fast_food', label: '🍟 Fast food' },
  { id: 'restaurant', label: '🍽️ Restaurant' },
  { id: 'cafe', label: '☕ Café' },
  { id: 'ice_cream', label: '🍦 Ice cream' },
  { id: 'food_court', label: '🏬 Food court' },
];

export function groupsOf(place) {
  const ids = new Set();
  for (const c of place.cuisines ?? []) {
    const id = GROUP_BY_CUISINE.get(c);
    if (id) ids.add(id);
  }
  return ids;
}

export const DEFAULT_FILTERS = {
  query: '',
  priceItem: 'any',
  maxPrice: null,
  useEstimates: true,
  minRating: 0,
  categories: new Set(),
  cuisines: new Set(),
  vegetarian: false,
  vegan: false,
  strictVeg: false,
  openNow: false,
  measuredOnly: false,
  favoritesOnly: false,
  sort: 'price',
};

/**
 * Il prezzo da mostrare e su cui filtrare: quello della voce scelta, oppure —
 * con "any" — la voce più economica fra quelle note. Senza `useEstimates` le
 * stime non contano né per il filtro né per l'ordinamento.
 */
export function resolvePrice(place, itemId = 'any', useEstimates = true) {
  const table = place.items ?? {};
  const usable = (entry) => entry && (useEstimates || entry.source !== 'estimate');

  if (itemId !== 'any') {
    const entry = table[itemId];
    return usable(entry) ? { ...entry, itemId } : null;
  }

  let best = null;
  for (const [id, entry] of Object.entries(table)) {
    if (!usable(entry)) continue;
    if (!best || entry.amount < best.amount) best = { ...entry, itemId: id };
  }
  return best;
}

export function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function matchesDiet(place, filters) {
  if (!filters.vegetarian && !filters.vegan) return true;
  const { vegetarian, vegan, inferred } = place.diet ?? {};
  const tagged =
    (filters.vegan && (vegan === 'yes' || vegan === 'only')) ||
    (filters.vegetarian && (vegetarian === 'yes' || vegetarian === 'only' || vegan === 'yes' || vegan === 'only'));
  if (tagged) return true;
  // senza tag espliciti accettiamo l'indizio della cucina, salvo modalità severa
  return !filters.strictVeg && Boolean(inferred);
}

export function applyFilters(places, filters, position) {
  const query = filters.query.trim().toLowerCase();

  const decorated = places.map((place) => ({
    ...place,
    shown: resolvePrice(place, filters.priceItem, filters.useEstimates),
    distance: position ? distanceKm(position, place) : null,
  }));

  const filtered = decorated.filter((place) => {
    if (query) {
      const haystack = `${place.name} ${(place.cuisines ?? []).join(' ')} ${place.address ?? ''} ${place.brand ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filters.categories.size && !filters.categories.has(place.category)) return false;
    if (filters.cuisines.size) {
      const groups = groupsOf(place);
      if (![...filters.cuisines].some((id) => groups.has(id))) return false;
    }
    if (!matchesDiet(place, filters)) return false;
    if (filters.favoritesOnly && !place.favorite) return false;

    // chiedere una voce specifica significa volere solo i locali che ce l'hanno
    if (filters.priceItem !== 'any' && !place.shown) return false;
    if (filters.measuredOnly && place.shown?.source === 'estimate') return false;
    if (filters.measuredOnly && !place.shown) return false;
    if (filters.maxPrice != null && place.shown && place.shown.amount > filters.maxPrice) return false;

    if (filters.minRating > 0 && (place.rating ?? 0) < filters.minRating) return false;
    if (filters.openNow && isOpenNow(place.openingHours) !== true) return false;
    return true;
  });

  const sorters = {
    // i locali senza prezzo/voto finiscono in fondo invece di falsare la classifica
    price: (a, b) => (a.shown?.amount ?? Infinity) - (b.shown?.amount ?? Infinity) || (b.rating ?? 0) - (a.rating ?? 0),
    rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || (a.shown?.amount ?? Infinity) - (b.shown?.amount ?? Infinity),
    distance: (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity),
    name: (a, b) => a.name.localeCompare(b.name, 'en'),
  };

  return [...filtered].sort(sorters[filters.sort] ?? sorters.price);
}

export const PRICE_ITEM_OPTIONS = [
  { id: 'any', label: 'Cheapest item' },
  ...REFERENCE_ITEMS.map((i) => ({ id: i.id, label: `${i.icon} ${i.label}` })),
];
