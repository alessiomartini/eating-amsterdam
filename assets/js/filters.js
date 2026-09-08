// Raggruppamento delle cucine OSM in categorie sensate e logica dei filtri.

import { isOpenNow } from './hours.js';

export const CUISINE_GROUPS = [
  { id: 'kebab', label: '🥙 Döner / kebab', match: ['kebab', 'doner', 'döner', 'turkish', 'shawarma', 'gyros'] },
  { id: 'friet', label: '🍟 Snackbar / friet', match: ['friture', 'chips', 'french_fries', 'fish_and_chips', 'snack', 'snack_bar', 'fries'] },
  { id: 'burger', label: '🍔 Burger', match: ['burger', 'american', 'hot_dog'] },
  { id: 'pizza', label: '🍕 Pizza / italiano', match: ['pizza', 'italian', 'pasta'] },
  { id: 'asian', label: '🍜 Asiatico', match: ['chinese', 'thai', 'vietnamese', 'japanese', 'sushi', 'korean', 'asian', 'ramen', 'noodle', 'wok', 'dumpling', 'malaysian', 'filipino'] },
  { id: 'indo', label: '🍛 Indonesiano / surinamese', match: ['indonesian', 'surinamese', 'javanese'] },
  { id: 'indian', label: '🍛 Indiano', match: ['indian', 'pakistani', 'nepalese', 'bangladeshi'] },
  { id: 'middle_east', label: '🧆 Falafel / mediorientale', match: ['falafel', 'lebanese', 'middle_eastern', 'syrian', 'persian', 'egyptian', 'israeli', 'moroccan'] },
  { id: 'sandwich', label: '🥪 Panini / bagel', match: ['sandwich', 'bagel', 'deli', 'broodjes', 'wrap'] },
  { id: 'mexican', label: '🌮 Messicano / latino', match: ['mexican', 'tex-mex', 'burrito', 'peruvian', 'brazilian', 'argentinian', 'latin_american'] },
  { id: 'african', label: '🍲 Africano / etiope', match: ['ethiopian', 'african', 'eritrean', 'senegalese', 'ghanaian'] },
  { id: 'veg', label: '🌱 Veg / vegano', match: ['vegetarian', 'vegan'] },
  { id: 'sweet', label: '🍩 Dolci / caffè', match: ['coffee_shop', 'coffee', 'cake', 'ice_cream', 'bakery', 'pancake', 'waffle', 'donut', 'stroopwafel', 'crepe'] },
  { id: 'dutch', label: '🇳🇱 Olandese', match: ['dutch', 'herring', 'pannenkoeken'] },
];

const GROUP_BY_CUISINE = new Map();
for (const group of CUISINE_GROUPS) for (const c of group.match) GROUP_BY_CUISINE.set(c, group.id);

export const CATEGORIES = [
  { id: 'fast_food', label: '🍟 Fast food' },
  { id: 'restaurant', label: '🍽️ Ristorante' },
  { id: 'cafe', label: '☕ Caffè' },
  { id: 'ice_cream', label: '🍦 Gelateria' },
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
  maxPrice: null,
  minRating: 0,
  categories: new Set(),
  cuisines: new Set(),
  vegetarian: false,
  vegan: false,
  strictVeg: false,
  openNow: false,
  hasPrice: false,
  favoritesOnly: false,
  sort: 'price',
};

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

  const filtered = places.filter((place) => {
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
    if (filters.hasPrice && place.price == null) return false;
    if (filters.maxPrice != null && place.price != null && place.price > filters.maxPrice) return false;
    if (filters.minRating > 0 && (place.rating ?? 0) < filters.minRating) return false;
    if (filters.openNow && isOpenNow(place.openingHours) !== true) return false;
    return true;
  });

  const withDistance = position
    ? filtered.map((p) => ({ ...p, distance: distanceKm(position, p) }))
    : filtered;

  const sorters = {
    // i locali senza prezzo/voto finiscono in fondo invece di falsare la classifica
    price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || (b.rating ?? 0) - (a.rating ?? 0),
    rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || (a.price ?? Infinity) - (b.price ?? Infinity),
    distance: (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity),
    name: (a, b) => a.name.localeCompare(b.name, 'it'),
  };

  return [...withDistance].sort(sorters[filters.sort] ?? sorters.price);
}
