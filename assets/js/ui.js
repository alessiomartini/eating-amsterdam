// Rendering della lista, della scheda locale e delle finestre di dialogo.

import { store } from './store.js';
import { decorate, priceBand } from './data.js';
import { CATEGORIES } from './filters.js';
import { isOpenNow, humanize } from './hours.js';

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export const money = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function dietBadges(place) {
  const badges = [];
  const { vegetarian, vegan, inferred } = place.diet ?? {};
  if (vegan === 'only') badges.push('<span class="badge vegan">100% vegano</span>');
  else if (vegan === 'yes') badges.push('<span class="badge vegan">🌱 opzioni vegane</span>');
  if (vegetarian === 'only') badges.push('<span class="badge veg">100% vegetariano</span>');
  else if (vegetarian === 'yes') badges.push('<span class="badge veg">🥗 opzioni veg</span>');
  if (!badges.length && inferred) badges.push('<span class="badge veg guess">probabile veg</span>');
  return badges.join('');
}

function priceCell(place) {
  if (place.price == null) {
    const level = place.priceLevel;
    if (level != null) return `<span class="price unknown">${'€'.repeat(Math.max(level, 1))} (stima Google)</span>`;
    return '<span class="price unknown">prezzo ignoto</span>';
  }
  return `<span class="price ${priceBand(place.price)}">${money(place.price)}</span>`;
}

function ratingCell(place) {
  if (place.rating == null) return '';
  const source = { mine: 'tuo voto', community: 'community', google: 'Google' }[place.ratingSource] ?? '';
  const reviews = place.ratingSource === 'google' && place.reviews ? ` · ${place.reviews}` : '';
  return `<span title="${esc(source)}">⭐ ${place.rating.toFixed(1)}${reviews}</span>`;
}

export function renderList(container, places, { onSelect, limit = 300 } = {}) {
  if (!places.length) {
    container.innerHTML = `<li class="empty">Nessun locale con questi filtri.<br />Prova ad allargare la ricerca.</li>`;
    return;
  }

  const shown = places.slice(0, limit);
  container.innerHTML = shown
    .map((place) => {
      const open = isOpenNow(place.openingHours);
      const openBadge = open === true ? '<span class="badge open">aperto</span>' : open === false ? '<span class="badge closed">chiuso</span>' : '';
      const distance = place.distance != null
        ? `<span>${place.distance < 1 ? `${Math.round(place.distance * 1000)} m` : `${place.distance.toFixed(1)} km`}</span>`
        : '';
      return `<li>
        <button type="button" class="card" data-id="${esc(place.id)}">
          <h3>${place.favorite ? '⭐ ' : ''}${esc(place.name)}</h3>
          <div class="meta">
            ${priceCell(place)}
            ${ratingCell(place)}
            <span>${esc(CATEGORY_LABEL[place.category] ?? place.category)}</span>
            ${distance}
            ${openBadge}
          </div>
          <div class="badges">${dietBadges(place)}</div>
          ${place.address ? `<div class="meta"><span>${esc(place.address)}</span></div>` : ''}
        </button>
      </li>`;
    })
    .join('');

  if (places.length > shown.length) {
    container.insertAdjacentHTML('beforeend', `<li class="empty">…e altri ${places.length - shown.length}. Restringi i filtri o usa la mappa.</li>`);
  }

  container.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => onSelect?.(card.dataset.id));
  });
}

function sheet(dialog, html) {
  dialog.innerHTML = `<button type="button" class="sheet-close" aria-label="Chiudi">×</button><div class="sheet-body">${html}</div>`;
  dialog.querySelector('.sheet-close').addEventListener('click', () => dialog.close());
  if (!dialog.open) dialog.showModal();
}

/* ---------------------------------------------------------------- scheda locale */

export function openDetail(place, { onChange } = {}) {
  const dialog = document.getElementById('detail');
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address ?? 'Amsterdam'}`)}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`;
  const open = isOpenNow(place.openingHours);

  const render = () => {
    // ricalcolo a ogni render: prezzo e voto cambiano mentre la scheda è aperta
    place = decorate(place);
    const mine = store.get(place.id) ?? { prices: [], rating: null, note: '', favorite: false };
    const allPrices = [...mine.prices.map((p) => ({ ...p, own: true })), ...(place.communityPrices ?? [])];

    sheet(dialog, `
      <h2>${esc(place.name)}</h2>
      <p class="sub">${esc(CATEGORY_LABEL[place.category] ?? place.category)}${place.cuisines?.length ? ` · ${esc(place.cuisines.join(', '))}` : ''}</p>
      <div class="badges">${dietBadges(place)}${open === true ? '<span class="badge open">aperto ora</span>' : open === false ? '<span class="badge closed">chiuso ora</span>' : ''}</div>

      <h3>Info</h3>
      <dl class="kv">
        ${place.address ? `<dt>Indirizzo</dt><dd>${esc(place.address)}</dd>` : ''}
        ${place.openingHours ? `<dt>Orari</dt><dd>${esc(humanize(place.openingHours))}</dd>` : ''}
        ${place.rating != null ? `<dt>Voto</dt><dd>⭐ ${place.rating.toFixed(1)}${place.reviews ? ` (${place.reviews} recensioni Google)` : ''}</dd>` : ''}
        ${place.priceLevel != null ? `<dt>Fascia Google</dt><dd>${'€'.repeat(Math.max(place.priceLevel, 1))}</dd>` : ''}
        ${place.takeaway ? `<dt>Asporto</dt><dd>${esc(place.takeaway)}</dd>` : ''}
      </dl>

      <div class="links">
        <a href="${gmaps}" target="_blank" rel="noopener">Google Maps ↗</a>
        <a href="${directions}" target="_blank" rel="noopener">Indicazioni ↗</a>
        ${place.website ? `<a href="${esc(place.website)}" target="_blank" rel="noopener">Sito ↗</a>` : ''}
        ${place.osmUrl ? `<a href="${esc(place.osmUrl)}" target="_blank" rel="noopener">OpenStreetMap ↗</a>` : ''}
        ${place.phone ? `<a href="tel:${esc(place.phone)}">${esc(place.phone)}</a>` : ''}
      </div>

      <h3>Prezzi ${place.price != null ? `— mediana ${money(place.price)}` : ''}</h3>
      ${allPrices.length
        ? `<ul class="price-list">${allPrices
            .map((p, i) => `<li>
                <span>${esc(p.dish)}${p.own ? '' : ` <span class="badge">${esc(p.by ?? 'community')}</span>`}</span>
                <span>${money(p.amount)}${p.own ? ` <button type="button" class="del" data-price="${i}" title="Elimina">🗑</button>` : ''}</span>
              </li>`)
            .join('')}</ul>`
        : '<p class="hint">Nessun prezzo ancora. Aggiungi il primo qui sotto: è così che la mappa diventa utile.</p>'}

      <form class="form-grid" id="price-form" style="margin-top:12px">
        <label>Piatto<input type="text" name="dish" placeholder="Döner, kapsalon, menu…" required /></label>
        <label>Prezzo €<input type="number" name="amount" min="0.5" max="200" step="0.10" required /></label>
        <button type="submit" class="primary">Aggiungi</button>
      </form>

      <h3>Il tuo voto</h3>
      <div class="stars" id="stars">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" class="${(mine.rating ?? 0) >= n ? 'on' : ''}" aria-label="${n} stelle">★</button>`).join('')}
      </div>

      <h3>Note</h3>
      <textarea id="note" rows="3" placeholder="Il kapsalon è enorme, meglio in due…" style="width:100%;background:var(--bg-elev-2);color:inherit;border:1px solid var(--line);border-radius:8px;padding:8px">${esc(mine.note)}</textarea>

      <div class="actions">
        <button type="button" class="ghost" id="btn-fav">${mine.favorite ? '⭐ Nei preferiti' : '☆ Aggiungi ai preferiti'}</button>
        ${place.source === 'custom' ? '<button type="button" class="ghost" id="btn-remove">Elimina locale</button>' : ''}
      </div>
    `);

    dialog.querySelector('#price-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      store.addPrice(place.id, { dish: data.get('dish'), amount: data.get('amount') });
      onChange?.();
      render();
      toast('Prezzo salvato');
    });

    dialog.querySelectorAll('[data-price]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.removePrice(place.id, Number(btn.dataset.price));
        onChange?.();
        render();
      });
    });

    dialog.querySelectorAll('[data-star]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.setRating(place.id, Number(btn.dataset.star));
        onChange?.();
        render();
      });
    });

    dialog.querySelector('#note').addEventListener('change', (event) => {
      store.setNote(place.id, event.target.value);
      onChange?.();
    });

    dialog.querySelector('#btn-fav').addEventListener('click', () => {
      store.toggleFavorite(place.id);
      onChange?.();
      render();
    });

    dialog.querySelector('#btn-remove')?.addEventListener('click', () => {
      store.removeCustomPlace(place.id);
      dialog.close();
      onChange?.();
      toast('Locale eliminato');
    });
  };

  render();
}

/* ---------------------------------------------------------------- gestione dati */

export function openDataModal({ meta, count, onReload, onChange }) {
  const dialog = document.getElementById('modal');
  const state = store.all();
  const contributed = Object.values(state.places).reduce((sum, e) => sum + (e.prices?.length ?? 0), 0);

  sheet(dialog, `
    <h2>Dati</h2>
    <p class="sub">${count} locali · fonte: ${esc(meta.source ?? 'sconosciuta')} · aggiornati il ${esc(meta.updatedAt ?? '?')}</p>

    <h3>I tuoi contributi</h3>
    <p class="hint">${contributed} prezzi, ${Object.values(state.places).filter((e) => e.rating).length} voti, ${state.custom.length} locali aggiunti a mano.
    Sono salvati solo in questo browser: esportali per non perderli e per condividerli.</p>

    <label style="display:grid;gap:4px;font-size:12px;color:var(--muted);margin-top:12px">Il tuo nome (finisce accanto ai prezzi che condividi)
      <input type="text" id="author" value="${esc(state.author)}" placeholder="alessio" style="background:var(--bg-elev-2);border:1px solid var(--line);border-radius:8px;padding:8px" />
    </label>

    <div class="actions">
      <button type="button" class="primary" id="btn-export">⬇ Esporta i miei dati</button>
      <button type="button" class="ghost" id="btn-import">⬆ Importa</button>
      <button type="button" class="ghost" id="btn-reload">🔄 Riscarica da OpenStreetMap</button>
      <button type="button" class="ghost" id="btn-wipe">Cancella tutto</button>
    </div>
    <input type="file" id="file" accept="application/json" hidden />

    <h3>Da dove vengono i dati</h3>
    <p class="hint">Nomi, posizione, cucina e tag vegetariano/vegano arrivano da OpenStreetMap (licenza ODbL).
    Voti e fascia di prezzo, se presenti, dalla Google Places API. I prezzi dei singoli piatti non esistono in nessuna API pubblica: li mettiamo noi.</p>
  `);

  dialog.querySelector('#author').addEventListener('change', (e) => store.setAuthor(e.target.value));

  dialog.querySelector('#btn-export').addEventListener('click', () => {
    const blob = new Blob([store.export()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `eating-amsterdam-${state.author || 'contributi'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const file = dialog.querySelector('#file');
  dialog.querySelector('#btn-import').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const [chosen] = file.files;
    if (!chosen) return;
    try {
      store.import(await chosen.text());
      onChange?.();
      dialog.close();
      toast('Contributi importati');
    } catch (err) {
      toast(`Import fallito: ${err.message}`);
    }
  });

  dialog.querySelector('#btn-reload').addEventListener('click', () => {
    dialog.close();
    onReload?.();
  });

  dialog.querySelector('#btn-wipe').addEventListener('click', () => {
    if (!confirm('Cancellare prezzi, voti e locali aggiunti da questo browser?')) return;
    store.reset();
    onChange?.();
    dialog.close();
    toast('Dati locali cancellati');
  });
}

/* ---------------------------------------------------------------- nuovo locale */

export function openAddPlaceModal({ center, onAdded }) {
  const dialog = document.getElementById('modal');
  sheet(dialog, `
    <h2>Aggiungi un locale</h2>
    <p class="sub">Per i posti che non sono su OpenStreetMap. Resta salvato nel tuo browser (e nell'export).</p>
    <form id="add-form" style="display:grid;gap:10px">
      <label style="display:grid;gap:4px;font-size:12px;color:var(--muted)">Nome
        <input name="name" required style="background:var(--bg-elev-2);border:1px solid var(--line);border-radius:8px;padding:8px" /></label>
      <label style="display:grid;gap:4px;font-size:12px;color:var(--muted)">Indirizzo
        <input name="address" style="background:var(--bg-elev-2);border:1px solid var(--line);border-radius:8px;padding:8px" /></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="display:grid;gap:4px;font-size:12px;color:var(--muted)">Latitudine
          <input name="lat" type="number" step="0.000001" value="${center.lat.toFixed(6)}" required style="background:var(--bg-elev-2);border:1px solid var(--line);border-radius:8px;padding:8px" /></label>
        <label style="display:grid;gap:4px;font-size:12px;color:var(--muted)">Longitudine
          <input name="lon" type="number" step="0.000001" value="${center.lon.toFixed(6)}" required style="background:var(--bg-elev-2);border:1px solid var(--line);border-radius:8px;padding:8px" /></label>
      </div>
      <p class="hint">Il centro della mappa è già compilato: sposta la mappa sul punto giusto prima di aprire questa finestra.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="display:grid;gap:4px;font-size:12px;color:var(--muted)">Tipo
          <select name="category" style="background:var(--bg-elev-2);border:1px solid var(--line);border-radius:8px;padding:8px">
            ${CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join('')}
          </select></label>
        <label style="display:grid;gap:4px;font-size:12px;color:var(--muted)">Cucina (separata da virgole)
          <input name="cuisines" placeholder="kebab, turkish" style="background:var(--bg-elev-2);border:1px solid var(--line);border-radius:8px;padding:8px" /></label>
      </div>
      <div class="chips">
        <label class="chip"><input type="checkbox" name="vegetarian" /><span>🥗 Opzioni vegetariane</span></label>
        <label class="chip"><input type="checkbox" name="vegan" /><span>🌱 Opzioni vegane</span></label>
      </div>
      <div class="actions"><button type="submit" class="primary">Aggiungi</button></div>
    </form>
  `);

  dialog.querySelector('#add-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    const place = {
      id: `custom:${Date.now().toString(36)}`,
      name: String(data.get('name')).trim(),
      lat: Number(data.get('lat')),
      lon: Number(data.get('lon')),
      category: data.get('category'),
      cuisines: String(data.get('cuisines') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      diet: {
        vegetarian: data.get('vegetarian') ? 'yes' : null,
        vegan: data.get('vegan') ? 'yes' : null,
        inferred: false,
      },
      address: String(data.get('address') ?? '').trim() || null,
      website: null,
      phone: null,
      openingHours: null,
      source: 'custom',
    };
    store.addCustomPlace(place);
    dialog.close();
    onAdded?.(place);
    toast('Locale aggiunto');
  });
}
