// Rendering della lista, della scheda locale e delle finestre di dialogo.
// I testi rivolti all'utente sono in inglese; i commenti restano in italiano.

import { store } from './store.js';
import { decorate, priceBand, setLivePrices } from './data.js';
import { fetchPlacePrices, isOnline, submitFeedback, submitPrice } from './api.js';
import { CATEGORIES } from './filters.js';
import { REFERENCE_ITEMS, itemApplies } from './items.js';
import { isOpenNow, humanize } from './hours.js';

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export const money = (n) => `€${Number(n).toFixed(2)}`;

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
  if (vegan === 'only') badges.push('<span class="badge vegan">100% vegan</span>');
  else if (vegan === 'yes') badges.push('<span class="badge vegan">🌱 vegan options</span>');
  if (vegetarian === 'only') badges.push('<span class="badge veg">100% vegetarian</span>');
  else if (vegetarian === 'yes') badges.push('<span class="badge veg">🥗 veggie options</span>');
  if (!badges.length && inferred) badges.push('<span class="badge veg guess">likely veggie-friendly</span>');
  return badges.join('');
}

const UNCERTAIN_HINT = 'The latest report is far from the earlier ones — it may be a typo or a different dish. Add yours to settle it.';

const SOURCE_LABEL = {
  measured: 'reported by a visitor',
  menu: 'read from the place’s own menu',
  estimate: 'our estimate, not a real price',
};

/** Il prezzo in lista: le stime si distinguono a colpo d'occhio da un prezzo vero. */
function priceCell(place) {
  const shown = place.shown;
  if (!shown) return '<span class="price unknown">no price yet</span>';

  const item = REFERENCE_ITEMS.find((i) => i.id === shown.itemId);
  const what = item ? ` ${item.icon}` : '';
  if (shown.source === 'estimate') {
    return `<span class="price est" title="${esc(SOURCE_LABEL.estimate)} — ${esc(shown.basis.join(', '))}">≈${money(shown.amount)}${what}</span>`;
  }
  const flag = shown.uncertain ? `<span class="badge warn" title="${esc(UNCERTAIN_HINT)}">?</span>` : '';
  return `<span class="price ${priceBand(shown.amount)}" title="${esc(SOURCE_LABEL[shown.source])}">${money(shown.amount)}${what}${shown.source === 'menu' ? ' <span class="badge">menu</span>' : ''}${flag}</span>`;
}

function ratingCell(place) {
  if (place.rating == null) return '';
  const source = { mine: 'your rating', community: 'community', google: 'Google' }[place.ratingSource] ?? '';
  const reviews = place.ratingSource === 'google' && place.reviews ? ` · ${place.reviews}` : '';
  return `<span title="${esc(source)}">⭐ ${place.rating.toFixed(1)}${reviews}</span>`;
}

export function renderList(container, places, { onSelect, limit = 300 } = {}) {
  if (!places.length) {
    container.innerHTML = '<li class="empty">No places match these filters.<br />Try widening your search.</li>';
    return;
  }

  const shown = places.slice(0, limit);
  container.innerHTML = shown
    .map((place) => {
      const open = isOpenNow(place.openingHours);
      const openBadge = open === true ? '<span class="badge open">open</span>' : open === false ? '<span class="badge closed">closed</span>' : '';
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
    container.insertAdjacentHTML('beforeend', `<li class="empty">…and ${places.length - shown.length} more. Narrow the filters or use the map.</li>`);
  }

  container.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => onSelect?.(card.dataset.id));
  });
}

function sheet(dialog, html) {
  dialog.innerHTML = `<button type="button" class="sheet-close" aria-label="Close">×</button><div class="sheet-body">${html}</div>`;
  dialog.querySelector('.sheet-close').addEventListener('click', () => dialog.close());
  if (!dialog.open) dialog.showModal();
}

/* ---------------------------------------------------------------- scheda locale */

/** La tabella delle sei voci: valore, provenienza e campo per correggerla. */
function itemsTable(place) {
  // mostriamo anche le voci fuori euristica per cui però un prezzo vero esiste
  const rows = REFERENCE_ITEMS.filter((item) => itemApplies(item.id, place) || place.items?.[item.id]).map((item) => {
    const entry = place.items?.[item.id];
    let value = '<span class="muted">—</span>';

    if (entry?.source === 'estimate') {
      value = `<span class="est">≈${money(entry.amount)}</span>
        <span class="src" title="${esc(entry.basis.join(' · '))}">estimate · ${esc(entry.basis.join(' · '))}</span>`;
    } else if (entry?.source === 'menu') {
      value = `<strong>${money(entry.amount)}</strong><span class="src">from their menu</span>`;
    } else if (entry?.source === 'measured') {
      // come nelle app dei carburanti: si mostra l'ultimo prezzo, con la data
      const when = entry.date ? ` on ${esc(entry.date)}` : '';
      const others = entry.samples > 1 ? ` · ${entry.samples} reports` : '';
      const warn = entry.uncertain
        ? `<span class="badge warn" title="${esc(UNCERTAIN_HINT)}">? unverified</span>`
        : '';
      value = `<strong>${money(entry.amount)}</strong> ${warn}<span class="src">latest${when}${others}</span>`;
    }

    return `<tr>
      <th scope="row">${item.icon} ${esc(item.label)}<span class="src">${esc(item.hint)}</span></th>
      <td>${value}</td>
      <td><input type="number" min="0.5" max="200" step="0.10" name="item-${item.id}" placeholder="€" aria-label="Your price for ${esc(item.label)}" /></td>
    </tr>`;
  });

  if (!rows.length) return '<p class="hint">None of the six reference items fit this place.</p>';

  // lo storico completo, per chi vuole vedere come si è mosso un prezzo
  const history = REFERENCE_ITEMS
    .filter((item) => (place.items?.[item.id]?.history ?? []).length > 1)
    .map((item) => {
      const entry = place.items[item.id];
      const points = entry.history
        .map((p) => `<li><span>${esc(p.date ?? '?')}${p.by ? ` · ${esc(p.by)}` : ''}</span><span>${money(p.amount)}</span></li>`)
        .join('');
      return `<details class="history"><summary>${item.icon} ${esc(item.label)} — ${entry.samples} reports</summary><ul class="price-list">${points}</ul></details>`;
    })
    .join('');

  return `<table class="items">${rows.join('')}</table>${history}`;
}

export function openDetail(place, { onChange } = {}) {
  const dialog = document.getElementById('detail');

  // i prezzi condivisi arrivati dopo l'ultima sincronizzazione del dataset
  if (isOnline()) {
    fetchPlacePrices(place.id).then((prices) => {
      if (!prices || !dialog.open) return;
      setLivePrices(place.id, prices);
      onChange?.();
      render();
    });
  }
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address ?? 'Amsterdam'}`)}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`;

  const render = () => {
    // ricalcolo a ogni render: prezzi e voto cambiano mentre la scheda è aperta
    place = decorate(place);
    const mine = store.get(place.id) ?? { prices: [], rating: null, note: '', favorite: false };
    const open = isOpenNow(place.openingHours);
    const otherPrices = [
      ...mine.prices.filter((p) => !p.item).map((p) => ({ ...p, own: true })),
      ...(place.communityPrices ?? []).filter((p) => !p.item),
    ];

    sheet(dialog, `
      <h2>${esc(place.name)}</h2>
      <p class="sub">${esc(CATEGORY_LABEL[place.category] ?? place.category)}${place.cuisines?.length ? ` · ${esc(place.cuisines.join(', '))}` : ''}</p>
      <div class="badges">${dietBadges(place)}${open === true ? '<span class="badge open">open now</span>' : open === false ? '<span class="badge closed">closed now</span>' : ''}</div>

      <h3>What things cost</h3>
      <form id="items-form">
        ${itemsTable(place)}
        <div class="actions"><button type="submit" class="primary">Save my prices</button></div>
      </form>
      <p class="hint">Values marked <span class="est">≈</span> are estimates from the price level, the neighbourhood and the type of place — not real prices. Type what you actually paid and the estimate is replaced.</p>

      <h3>Details</h3>
      <dl class="kv">
        ${place.address ? `<dt>Address</dt><dd>${esc(place.address)}</dd>` : ''}
        ${place.openingHours ? `<dt>Opening hours</dt><dd>${esc(humanize(place.openingHours))}</dd>` : ''}
        ${place.rating != null ? `<dt>Rating</dt><dd>⭐ ${place.rating.toFixed(1)}${place.reviews ? ` (${place.reviews} Google reviews)` : ''}</dd>` : ''}
        ${place.google?.priceLevel != null ? `<dt>Google price level</dt><dd>${'€'.repeat(Math.max(place.google.priceLevel, 1))}</dd>` : ''}
        ${place.takeaway ? `<dt>Takeaway</dt><dd>${esc(place.takeaway)}</dd>` : ''}
      </dl>

      <div class="links">
        <a href="${gmaps}" target="_blank" rel="noopener">Google Maps ↗</a>
        <a href="${directions}" target="_blank" rel="noopener">Directions ↗</a>
        ${place.website ? `<a href="${esc(place.website)}" target="_blank" rel="noopener">Website ↗</a>` : ''}
        ${place.osmUrl ? `<a href="${esc(place.osmUrl)}" target="_blank" rel="noopener">OpenStreetMap ↗</a>` : ''}
        ${place.phone ? `<a href="tel:${esc(place.phone)}">${esc(place.phone)}</a>` : ''}
      </div>

      <h3>Other dishes</h3>
      ${otherPrices.length
        ? `<ul class="price-list">${otherPrices
            .map((p, i) => `<li>
                <span>${esc(p.dish)}${p.own ? '' : ` <span class="badge">${esc(p.by ?? 'community')}</span>`}</span>
                <span>${money(p.amount)}${p.own ? ` <button type="button" class="del" data-dish="${esc(p.dish)}" title="Delete">🗑</button>` : ''}</span>
              </li>`)
            .join('')}</ul>`
        : '<p class="hint">Nothing else recorded yet.</p>'}

      <form class="form-grid" id="price-form" style="margin-top:12px">
        <label>Dish<input type="text" name="dish" placeholder="Kapsalon, broodje…" required /></label>
        <label>Price €<input type="number" name="amount" min="0.5" max="200" step="0.10" required /></label>
        <button type="submit" class="primary">Add</button>
      </form>

      <h3>Your rating</h3>
      <div class="stars" id="stars">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" class="${(mine.rating ?? 0) >= n ? 'on' : ''}" aria-label="${n} stars">★</button>`).join('')}
      </div>

      <h3>Notes</h3>
      <textarea id="note" rows="3" placeholder="Huge portions, cash only, open late…" style="width:100%;background:var(--bg-elev-2);color:inherit;border:1px solid var(--line);border-radius:8px;padding:8px">${esc(mine.note)}</textarea>

      <div class="actions">
        <button type="button" class="ghost" id="btn-fav">${mine.favorite ? '⭐ In favourites' : '☆ Add to favourites'}</button>
        ${place.source === 'custom' ? '<button type="button" class="ghost" id="btn-remove">Delete place</button>' : ''}
      </div>
    `);

    dialog.querySelector('#items-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const sent = [];
      let saved = 0;
      for (const input of event.target.querySelectorAll('input[name^="item-"]')) {
        const amount = Number(input.value);
        if (!input.value || !Number.isFinite(amount) || amount <= 0) continue;
        const itemId = input.name.slice('item-'.length);
        const item = REFERENCE_ITEMS.find((i) => i.id === itemId);
        store.addPrice(place.id, { dish: item.label, amount, item: itemId });
        sent.push(submitPrice({ placeId: place.id, item: itemId, dish: item.label, amount }));
        saved += 1;
      }
      if (!saved) return toast('Type at least one price first');
      onChange?.();
      render();
      reportOutcome(saved, await Promise.all(sent));
    });

    dialog.querySelector('#price-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      const dish = data.get('dish');
      const amount = data.get('amount');
      store.addPrice(place.id, { dish, amount });
      onChange?.();
      render();
      reportOutcome(1, [await submitPrice({ placeId: place.id, item: null, dish, amount: Number(amount) })]);
    });

    dialog.querySelectorAll('[data-dish]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.removePriceByDish(place.id, btn.dataset.dish);
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
      toast('Place deleted');
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
    <h2>Data</h2>
    <p class="sub">${count} places · source: ${esc(meta.source ?? 'unknown')} · updated ${esc(meta.updatedAt ?? '?')}</p>

    <h3>Your contributions</h3>
    <p class="hint">${contributed} prices, ${Object.values(state.places).filter((e) => e.rating).length} ratings, ${state.custom.length} places you added.</p>
    <p class="hint">${isOnline()
      ? 'Prices you add are <strong>shared publicly</strong> with everyone using the site — that is what makes it useful. Ratings, notes and favourites stay in this browser.'
      : 'Everything stays in this browser: export it so it is not lost, and so it can be shared.'}</p>

    <label style="display:grid;gap:4px;font-size:12px;color:var(--muted);margin-top:12px">Your name (shown next to prices you share)
      <input type="text" id="author" value="${esc(state.author)}" placeholder="alessio" style="background:var(--bg-elev-2);border:1px solid var(--line);border-radius:8px;padding:8px" />
    </label>

    <div class="actions">
      <button type="button" class="primary" id="btn-export">⬇ Export my data</button>
      <button type="button" class="ghost" id="btn-import">⬆ Import</button>
      <button type="button" class="ghost" id="btn-reload">🔄 Refetch from OpenStreetMap</button>
      <button type="button" class="ghost" id="btn-wipe">Erase everything</button>
    </div>
    <input type="file" id="file" accept="application/json" hidden />

    <h3>Where the data comes from</h3>
    <p class="hint">Names, location, cuisine and the vegetarian/vegan tags come from OpenStreetMap (ODbL licence).
    Ratings and price level, where present, from the Google Places API. Menu prices are read from each place’s own website.
    Everything else is an estimate until someone types in what they actually paid.</p>
  `);

  dialog.querySelector('#author').addEventListener('change', (e) => store.setAuthor(e.target.value));

  dialog.querySelector('#btn-export').addEventListener('click', () => {
    const blob = new Blob([store.export()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `eating-amsterdam-${state.author || 'contributions'}.json`;
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
      toast('Contributions imported');
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  });

  dialog.querySelector('#btn-reload').addEventListener('click', () => {
    dialog.close();
    onReload?.();
  });

  dialog.querySelector('#btn-wipe').addEventListener('click', () => {
    if (!confirm('Erase the prices, ratings and places stored in this browser?')) return;
    store.reset();
    onChange?.();
    dialog.close();
    toast('Local data erased');
  });
}

/* ---------------------------------------------------------------- nuovo locale */

const inputStyle = 'background:var(--bg-elev-2);border:1px solid var(--line);border-radius:8px;padding:8px';
const labelStyle = 'display:grid;gap:4px;font-size:12px;color:var(--muted)';

export function openAddPlaceModal({ center, onAdded }) {
  const dialog = document.getElementById('modal');
  sheet(dialog, `
    <h2>Add a place</h2>
    <p class="sub">For spots that are not on OpenStreetMap. Stored in your browser and included in your export.</p>
    <form id="add-form" style="display:grid;gap:10px">
      <label style="${labelStyle}">Name<input name="name" required style="${inputStyle}" /></label>
      <label style="${labelStyle}">Address<input name="address" style="${inputStyle}" /></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="${labelStyle}">Latitude<input name="lat" type="number" step="0.000001" value="${center.lat.toFixed(6)}" required style="${inputStyle}" /></label>
        <label style="${labelStyle}">Longitude<input name="lon" type="number" step="0.000001" value="${center.lon.toFixed(6)}" required style="${inputStyle}" /></label>
      </div>
      <p class="hint">Prefilled with the centre of the map: pan to the right spot before opening this dialog.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="${labelStyle}">Type
          <select name="category" style="${inputStyle}">
            ${CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join('')}
          </select></label>
        <label style="${labelStyle}">Cuisine (comma separated)<input name="cuisines" placeholder="kebab, turkish" style="${inputStyle}" /></label>
      </div>
      <div class="chips">
        <label class="chip"><input type="checkbox" name="vegetarian" /><span>🥗 Vegetarian options</span></label>
        <label class="chip"><input type="checkbox" name="vegan" /><span>🌱 Vegan options</span></label>
      </div>
      <div class="actions"><button type="submit" class="primary">Add</button></div>
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
    toast('Place added');
  });
}

/* ---------------------------------------------------------------- segnalazioni */

const REPO = 'alessiomartini/eating-amsterdam';

/**
 * La casella per dire cosa non va. Senza un backend l'unico modo perché una
 * segnalazione arrivi davvero a chi sviluppa — e sia leggibile da lì senza che
 * nessuno faccia copia-incolla — è farla diventare una issue su GitHub: il testo
 * viaggia già scritto nell'URL, all'utente resta un clic su "Submit".
 * Una copia resta comunque salvata nel browser, così nulla va perso.
 */
export function openFeedbackModal({ context }) {
  const dialog = document.getElementById('modal');
  const previous = store.notes();

  sheet(dialog, `
    <h2>Something to improve?</h2>
    <p class="sub">Missing place, wrong price, confusing filter — anything.</p>

    <form id="note-form" style="display:grid;gap:10px">
      <textarea name="text" rows="4" required placeholder="Kriterion is missing. The döner filter shows places that don't do döner…"
        style="width:100%;background:var(--bg-elev-2);color:inherit;border:1px solid var(--line);border-radius:8px;padding:10px"></textarea>
      <label class="chip" style="justify-self:start"><input type="checkbox" name="withContext" checked /><span>Attach what I was looking at</span></label>
      <div class="actions">
        <button type="submit" class="primary">Send</button>
      </div>
    </form>

    <p class="hint">${isOnline()
      ? 'Goes straight to the people working on the site. A copy stays in this browser.'
      : 'Send opens a prefilled GitHub issue — the text is already written, you only press Submit. It needs a GitHub account, and it is public.'}</p>

    ${previous.length ? `<h3>Sent from this browser</h3>${previous.slice(0, 8).map((n) => `
      <div class="feedback-note"><span>${esc(n.text)}</span><time>${esc(n.at.slice(0, 10))}</time></div>`).join('')}` : ''}
  `);

  dialog.querySelector('#note-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    const text = String(data.get('text')).trim();
    if (!text) return;

    const attached = data.get('withContext') ? context : null;
    store.addNote({ text, context: attached });

    if (isOnline()) {
      const outcome = await submitFeedback({ text, context: attached });
      dialog.close();
      toast(outcome === 'queued' ? 'Saved — will be sent when you are back online' : 'Sent — thank you');
      return;
    }

    // senza backend l'unico modo perché arrivi davvero è farla diventare una issue
    const body = [
      text,
      '',
      '---',
      data.get('withContext') ? `<!-- context -->\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\`` : '',
      '_Sent from the Eating Amsterdam site._',
    ].filter(Boolean).join('\n');

    const url = `https://github.com/${REPO}/issues/new`
      + `?labels=feedback&title=${encodeURIComponent(text.slice(0, 70))}`
      + `&body=${encodeURIComponent(body)}`;

    window.open(url, '_blank', 'noopener');
    dialog.close();
    toast('Saved — finish by pressing Submit on GitHub');
    return note;
  });
}

/** Dice all'utente dove è finito quello che ha scritto, senza girarci intorno. */
function reportOutcome(count, results) {
  const what = count === 1 ? 'price' : `${count} prices`;
  if (!isOnline()) return toast(`Saved ${what} in this browser`);
  if (results.includes('rejected')) return toast('The server rejected that price — does it look right?');
  if (results.includes('queued')) return toast(`Saved ${what} — will be shared when you are back online`);
  return toast(`Shared ${what} — thank you`);
}
