// Logica dei filtri: quali locali comparire e con quale prezzo mostrarli.
//
// Il modello è "cosa voglio bere/mangiare, non che tipo di locale è": non si
// filtra più per tipo di posto o cucina, si sceglie una o più delle voci di
// riferimento (caffè, birra, döner...). Con più voci selezionate un locale
// compare solo se le offre tutte (AND), e il prezzo mostrato/usato per
// ordinare e colorare è la somma semplice delle voci scelte — non una media
// pesata, che richiederebbe decidere pesi arbitrari senza un motivo migliore.

import { isOpenNow } from './hours.js';
import { REFERENCE_ITEMS } from './items.js';

// Serve ancora per l'etichetta del tipo di locale sulle card e per il
// <select> di "Aggiungi un locale": non è più un filtro nella sidebar.
export const CATEGORIES = [
  { id: 'fast_food', label: '🍟 Fast food' },
  { id: 'restaurant', label: '🍽️ Restaurant' },
  { id: 'cafe', label: '☕ Café' },
  { id: 'bar', label: '🍸 Bar' },
  { id: 'pub', label: '🍻 Pub' },
  { id: 'ice_cream', label: '🍦 Ice cream' },
  { id: 'food_court', label: '🏬 Food court' },
];

export const DEFAULT_FILTERS = {
  query: '',
  items: new Set(),
  maxPrice: null,
  useEstimates: true,
  minRating: 0,
  vegetarian: false,
  vegan: false,
  strictVeg: false,
  openNow: false,
  studentDiscount: false,
  measuredOnly: false,
  favoritesOnly: false,
  sort: 'price',
};

/**
 * Il prezzo su cui filtrare/ordinare/colorare, per le voci scelte.
 *
 * - nessuna voce scelta → null: nessun prezzo da mostrare, nessun filtro.
 * - una o più voci scelte → il locale deve averle TUTTE (altrimenti null, e
 *   applyFilters lo esclude): niente "quasi" quando hai chiesto "caffè e birra".
 * - il prezzo è la somma delle voci trovate. `hasEstimate` è true se anche una
 *   sola componente è una stima: la somma eredita l'incertezza della parte
 *   meno affidabile, non fa la media fra "sicuro" e "indovinato".
 */
export function resolvePrice(place, items, useEstimates = true) {
  if (!items || items.size === 0) return null;
  const table = place.items ?? {};

  let amount = 0;
  let hasEstimate = false;
  let uncertain = false;
  const breakdown = [];

  for (const id of items) {
    const entry = table[id];
    if (!entry) return null; // AND: manca questa voce, il locale non risponde alla domanda
    if (!useEstimates && entry.source === 'estimate') return null;
    amount += entry.amount;
    if (entry.source === 'estimate') hasEstimate = true;
    if (entry.uncertain) uncertain = true;
    breakdown.push({ id, amount: entry.amount, source: entry.source });
  }

  return { amount: Math.round(amount * 100) / 100, hasEstimate, uncertain, itemIds: [...items], breakdown };
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
    shown: resolvePrice(place, filters.items, filters.useEstimates),
    distance: position ? distanceKm(position, place) : null,
  }));

  const filtered = decorated.filter((place) => {
    if (query) {
      const haystack = `${place.name} ${(place.cuisines ?? []).join(' ')} ${place.address ?? ''} ${place.brand ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (!matchesDiet(place, filters)) return false;
    if (filters.favoritesOnly && !place.favorite) return false;

    // aver chiesto una o più voci significa volere solo i locali che le hanno tutte
    if (filters.items.size && !place.shown) return false;
    if (filters.measuredOnly && place.shown?.hasEstimate) return false;
    if (filters.maxPrice != null && place.shown && place.shown.amount > filters.maxPrice) return false;

    if (filters.minRating > 0 && (place.rating ?? 0) < filters.minRating) return false;
    if (filters.openNow && isOpenNow(place.openingHours) !== true) return false;
    if (filters.studentDiscount && place.flags?.student_discount?.value !== true) return false;
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

export const ITEM_CHIPS = REFERENCE_ITEMS.map((i) => ({ id: i.id, label: `${i.icon} ${i.label}` }));
