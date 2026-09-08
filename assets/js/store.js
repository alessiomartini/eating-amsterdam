// Contributi dell'utente salvati nel browser (prezzi, voti, note, preferiti,
// locali aggiunti a mano). Sono tuoi e restano sul tuo dispositivo finché non
// li esporti; `scripts/merge-contributions.mjs` li riversa nel dataset condiviso.

const KEY = 'eating-amsterdam:v1';

const empty = () => ({ author: '', places: {}, custom: [] });

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}

let state = read();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // quota piena o storage disabilitato: l'app continua a funzionare in memoria
  }
  for (const fn of listeners) fn(state);
}

function entryFor(placeId) {
  state.places[placeId] ??= { prices: [], rating: null, note: '', favorite: false };
  return state.places[placeId];
}

export const store = {
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  all: () => state,
  get: (placeId) => state.places[placeId] ?? null,
  customPlaces: () => state.custom,

  setAuthor(name) {
    state.author = name.trim();
    persist();
  },

  addPrice(placeId, { dish, amount }) {
    const entry = entryFor(placeId);
    entry.prices.push({ dish: dish.trim() || 'Piatto', amount: Number(amount), currency: 'EUR', date: new Date().toISOString().slice(0, 10) });
    persist();
  },

  removePrice(placeId, index) {
    const entry = state.places[placeId];
    if (!entry) return;
    entry.prices.splice(index, 1);
    persist();
  },

  setRating(placeId, value) {
    const entry = entryFor(placeId);
    entry.rating = entry.rating === value ? null : value;
    persist();
  },

  setNote(placeId, note) {
    entryFor(placeId).note = note;
    persist();
  },

  toggleFavorite(placeId) {
    const entry = entryFor(placeId);
    entry.favorite = !entry.favorite;
    persist();
    return entry.favorite;
  },

  addCustomPlace(place) {
    state.custom.push(place);
    persist();
  },

  removeCustomPlace(id) {
    state.custom = state.custom.filter((p) => p.id !== id);
    delete state.places[id];
    persist();
  },

  export() {
    return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
  },

  import(json, { merge = true } = {}) {
    const incoming = JSON.parse(json);
    if (!incoming || typeof incoming !== 'object') throw new Error('File non valido');
    if (!merge) {
      state = { ...empty(), ...incoming };
      persist();
      return;
    }
    state.author ||= incoming.author ?? '';
    for (const [id, entry] of Object.entries(incoming.places ?? {})) {
      const mine = entryFor(id);
      const seen = new Set(mine.prices.map((p) => `${p.dish}|${p.amount}|${p.date}`));
      for (const price of entry.prices ?? []) {
        if (!seen.has(`${price.dish}|${price.amount}|${price.date}`)) mine.prices.push(price);
      }
      mine.rating ??= entry.rating ?? null;
      mine.note ||= entry.note ?? '';
      mine.favorite ||= Boolean(entry.favorite);
    }
    const ids = new Set(state.custom.map((p) => p.id));
    for (const place of incoming.custom ?? []) if (!ids.has(place.id)) state.custom.push(place);
    persist();
  },

  reset() {
    state = empty();
    persist();
  },
};
