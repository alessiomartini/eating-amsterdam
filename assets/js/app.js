// Punto di ingresso: collega dati, filtri, mappa e lista.

import { decorate, loadPlaces } from './data.js';
import { applyFilters, CATEGORIES, CUISINE_GROUPS, DEFAULT_FILTERS } from './filters.js';
import { focusPlace, highlight, initMap, invalidate, setPlaces, showUser } from './map.js';
import { openAddPlaceModal, openDataModal, openDetail, renderList, toast } from './ui.js';
import { store } from './store.js';

const MAX_PRICE = 31; // 31 = "qualsiasi" sullo slider
const FILTERS_KEY = 'eating-amsterdam:filters:v1';

const el = (id) => document.getElementById(id);
const state = {
  meta: {},
  base: [],   // dataset OSM/committato, senza campi derivati
  places: [], // base + locali aggiunti a mano, con prezzi e voti applicati
  filtered: [],
  position: null,
  selectedId: null,
};

/* ---------------------------------------------------------------- filtri UI */

function renderChips() {
  el('f-categories').innerHTML = CATEGORIES.map(
    (c) => `<label class="chip"><input type="checkbox" name="category" value="${c.id}" /><span>${c.label}</span></label>`,
  ).join('');
  el('f-cuisines').innerHTML = CUISINE_GROUPS.map(
    (c) => `<label class="chip"><input type="checkbox" name="cuisine" value="${c.id}" /><span>${c.label}</span></label>`,
  ).join('');
}

function readFilters() {
  const maxPrice = Number(el('f-maxprice').value);
  const minRating = Number(el('f-minrating').value);
  return {
    ...DEFAULT_FILTERS,
    query: el('f-query').value,
    maxPrice: maxPrice >= MAX_PRICE ? null : maxPrice,
    minRating,
    categories: new Set([...document.querySelectorAll('input[name="category"]:checked')].map((i) => i.value)),
    cuisines: new Set([...document.querySelectorAll('input[name="cuisine"]:checked')].map((i) => i.value)),
    vegetarian: el('f-vegetarian').checked,
    vegan: el('f-vegan').checked,
    strictVeg: el('f-veg-strict').checked,
    openNow: el('f-open').checked,
    hasPrice: el('f-haspri').checked,
    favoritesOnly: el('f-fav').checked,
    sort: el('f-sort').value,
  };
}

function writeFilters(saved) {
  if (!saved) return;
  el('f-query').value = saved.query ?? '';
  el('f-maxprice').value = saved.maxPrice ?? MAX_PRICE;
  el('f-minrating').value = saved.minRating ?? 0;
  el('f-vegetarian').checked = Boolean(saved.vegetarian);
  el('f-vegan').checked = Boolean(saved.vegan);
  el('f-veg-strict').checked = Boolean(saved.strictVeg);
  el('f-open').checked = Boolean(saved.openNow);
  el('f-haspri').checked = Boolean(saved.hasPrice);
  el('f-fav').checked = Boolean(saved.favoritesOnly);
  el('f-sort').value = saved.sort ?? 'price';
  for (const value of saved.categories ?? []) {
    const input = document.querySelector(`input[name="category"][value="${value}"]`);
    if (input) input.checked = true;
  }
  for (const value of saved.cuisines ?? []) {
    const input = document.querySelector(`input[name="cuisine"][value="${value}"]`);
    if (input) input.checked = true;
  }
}

function persistFilters(filters) {
  try {
    localStorage.setItem(
      FILTERS_KEY,
      JSON.stringify({ ...filters, categories: [...filters.categories], cuisines: [...filters.cuisines] }),
    );
  } catch { /* storage non disponibile */ }
}

function syncOutputs(filters) {
  el('f-maxprice-out').textContent = filters.maxPrice == null ? 'qualsiasi' : `${filters.maxPrice} €`;
  el('f-minrating-out').textContent = filters.minRating ? `⭐ ${filters.minRating}` : 'qualsiasi';

  // quanti filtri secondari sono attivi, così restano visibili anche da chiusi
  const hidden =
    filters.categories.size + filters.cuisines.size +
    (filters.minRating > 0 ? 1 : 0) + (filters.openNow ? 1 : 0) +
    (filters.hasPrice ? 1 : 0) + (filters.favoritesOnly ? 1 : 0);
  const badge = el('more-count');
  badge.textContent = hidden;
  badge.hidden = hidden === 0;
  if (hidden > 0 && !el('more-filters').open) el('more-filters').open = true;
}

/* ---------------------------------------------------------------- rendering */

function update({ keepView = false } = {}) {
  const filters = readFilters();
  syncOutputs(filters);
  persistFilters(filters);

  state.filtered = applyFilters(state.places, filters, state.position);
  el('results-count').textContent = `${state.filtered.length} locali`;

  renderList(el('results'), state.filtered, { onSelect: select });
  setPlaces(state.filtered);
  if (state.selectedId) highlight(state.selectedId);
  if (!keepView) invalidate();
}

/** Ricompone la lista dopo ogni modifica ai contributi locali. */
function refreshFromStore({ keepView = true } = {}) {
  state.places = [...state.base, ...store.customPlaces()].map(decorate);
  update({ keepView });
}

function select(id) {
  const place = state.places.find((p) => p.id === id);
  if (!place) return;
  state.selectedId = id;
  highlight(id);
  focusPlace(place);
  openDetail(place, { onChange: refreshFromStore });
}

/* ---------------------------------------------------------------- avvio */

async function boot({ force = false } = {}) {
  el('results-count').textContent = 'Caricamento…';
  try {
    const data = await loadPlaces({ force, onProgress: (msg) => { el('results-count').textContent = msg; } });
    state.meta = { updatedAt: data.updatedAt, source: data.source };
    state.base = data.places;
    el('map-legend').hidden = false;
    refreshFromStore({ keepView: false });
  } catch (err) {
    el('results').innerHTML = `<li class="empty">Non riesco a scaricare i dati.<br />${err.message}<br />
      <button type="button" class="ghost" id="btn-retry">Riprova</button></li>`;
    el('results-count').textContent = 'Errore';
    el('btn-retry')?.addEventListener('click', () => boot({ force: true }));
  }
}

function wire() {
  el('filters').addEventListener('input', () => update({ keepView: true }));
  el('filters').addEventListener('submit', (e) => e.preventDefault());

  el('btn-reset').addEventListener('click', () => {
    el('filters').reset();
    el('f-maxprice').value = MAX_PRICE;
    el('f-minrating').value = 0;
    el('more-filters').open = false;
    update({ keepView: true });
  });

  el('btn-locate').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Geolocalizzazione non disponibile');
    toast('Cerco la tua posizione…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.position = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        showUser(state.position);
        el('f-sort').value = 'distance';
        update({ keepView: true });
      },
      () => toast('Posizione non disponibile'),
    );
  });

  el('btn-data').addEventListener('click', () =>
    openDataModal({
      meta: state.meta,
      count: state.places.length,
      onReload: () => boot({ force: true }),
      onChange: refreshFromStore,
    }));

  el('btn-add').addEventListener('click', () => {
    const center = window.__map?.getCenter?.() ?? { lat: 52.3728, lng: 4.8936 };
    openAddPlaceModal({
      center: { lat: center.lat, lon: center.lng },
      onAdded: (place) => {
        refreshFromStore();
        select(place.id);
      },
    });
  });

  el('mobile-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-view]');
    if (!button) return;
    el('layout').dataset.view = button.dataset.view;
    el('mobile-tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === button));
    invalidate();
  });
}

renderChips();
try {
  writeFilters(JSON.parse(localStorage.getItem(FILTERS_KEY) ?? 'null'));
} catch { /* filtri salvati illeggibili */ }

window.__map = initMap(el('map'), { onSelect: select });
el('layout').dataset.view = window.matchMedia('(max-width: 860px)').matches ? 'list' : 'both';
wire();
boot();
