// La logica AND + somma è il cuore del nuovo modello di filtro: "voglio caffè
// e birra" deve mostrare solo chi ha entrambi, con il prezzo totale — non una
// media, non "quasi tutti e due". Vale la pena testarla a fondo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, DEFAULT_FILTERS, resolvePrice } from '../assets/js/filters.js';

const entry = (amount, source = 'measured', uncertain = false) => ({ amount, source, uncertain });

test('senza voci scelte non c\'è prezzo da mostrare', () => {
  const place = { items: { coffee: entry(3) } };
  assert.equal(resolvePrice(place, new Set()), null);
});

test('una voce presente restituisce il suo importo', () => {
  const place = { items: { coffee: entry(3.2) } };
  const shown = resolvePrice(place, new Set(['coffee']));
  assert.equal(shown.amount, 3.2);
  assert.equal(shown.hasEstimate, false);
  assert.deepEqual(shown.itemIds, ['coffee']);
});

test('una voce assente esclude il locale (AND), non lo ignora soltanto', () => {
  const place = { items: { coffee: entry(3) } };
  assert.equal(resolvePrice(place, new Set(['beer'])), null);
});

test('con più voci ne basta una mancante per escludere', () => {
  const place = { items: { coffee: entry(3) } }; // niente beer
  assert.equal(resolvePrice(place, new Set(['coffee', 'beer'])), null);
});

test('con tutte le voci presenti il prezzo è la somma semplice', () => {
  const place = { items: { coffee: entry(3), beer: entry(5.2) } };
  const shown = resolvePrice(place, new Set(['coffee', 'beer']));
  assert.equal(shown.amount, 8.2);
  assert.deepEqual(shown.itemIds.sort(), ['beer', 'coffee']);
});

test('una sola componente stimata marca l\'intera somma come stima', () => {
  const place = { items: { coffee: entry(3, 'measured'), beer: entry(5, 'estimate') } };
  const shown = resolvePrice(place, new Set(['coffee', 'beer']));
  assert.equal(shown.amount, 8);
  assert.equal(shown.hasEstimate, true, 'basta una stima per marcare tutta la somma');
});

test('con "solo prezzi reali" una componente stimata esclude il locale', () => {
  const place = { items: { coffee: entry(3, 'measured'), beer: entry(5, 'estimate') } };
  assert.equal(resolvePrice(place, new Set(['coffee', 'beer']), false), null);
  // ma senza quella voce selezionata il locale resta valido
  assert.ok(resolvePrice(place, new Set(['coffee']), false));
});

test('uncertain si propaga se una qualsiasi componente lo è', () => {
  const place = { items: { coffee: entry(3, 'measured', true), beer: entry(5) } };
  const shown = resolvePrice(place, new Set(['coffee', 'beer']));
  assert.equal(shown.uncertain, true);
});

test('applyFilters esclude i locali senza tutte le voci scelte', () => {
  const places = [
    { id: 'a', name: 'A', lat: 0, lon: 0, cuisines: [], items: { coffee: entry(3), beer: entry(5) } },
    { id: 'b', name: 'B', lat: 0, lon: 0, cuisines: [], items: { coffee: entry(3) } }, // niente birra
  ];
  const filters = { ...DEFAULT_FILTERS, items: new Set(['coffee', 'beer']) };
  const result = applyFilters(places, filters, null);
  assert.deepEqual(result.map((p) => p.id), ['a']);
});

test('applyFilters ordina per il totale delle voci scelte', () => {
  const places = [
    { id: 'expensive', name: 'Expensive', lat: 0, lon: 0, cuisines: [], items: { coffee: entry(4), beer: entry(8) } },
    { id: 'cheap', name: 'Cheap', lat: 0, lon: 0, cuisines: [], items: { coffee: entry(2.5), beer: entry(4) } },
  ];
  const filters = { ...DEFAULT_FILTERS, items: new Set(['coffee', 'beer']), sort: 'price' };
  const result = applyFilters(places, filters, null);
  assert.deepEqual(result.map((p) => p.id), ['cheap', 'expensive']);
});

test('measuredOnly esclude un totale che contiene anche una sola stima', () => {
  const places = [
    { id: 'real', name: 'Real', lat: 0, lon: 0, cuisines: [], items: { coffee: entry(3) } },
    { id: 'part-est', name: 'Part', lat: 0, lon: 0, cuisines: [], items: { coffee: entry(3, 'estimate') } },
  ];
  const filters = { ...DEFAULT_FILTERS, items: new Set(['coffee']), measuredOnly: true };
  const result = applyFilters(places, filters, null);
  assert.deepEqual(result.map((p) => p.id), ['real']);
});

test('maxPrice confronta con il totale, non con una singola voce', () => {
  const places = [
    { id: 'a', name: 'A', lat: 0, lon: 0, cuisines: [], items: { coffee: entry(6), beer: entry(6) } }, // somma 12
    { id: 'b', name: 'B', lat: 0, lon: 0, cuisines: [], items: { coffee: entry(3), beer: entry(4) } }, // somma 7
  ];
  const filters = { ...DEFAULT_FILTERS, items: new Set(['coffee', 'beer']), maxPrice: 10 };
  const result = applyFilters(places, filters, null);
  assert.deepEqual(result.map((p) => p.id), ['b']);
});

test('senza voci scelte tutti i locali restano, ordinati per voto', () => {
  const places = [
    { id: 'a', name: 'A', lat: 0, lon: 0, cuisines: [], items: {}, rating: 4.0 },
    { id: 'b', name: 'B', lat: 0, lon: 0, cuisines: [], items: {}, rating: 4.8 },
  ];
  const filters = { ...DEFAULT_FILTERS, items: new Set(), sort: 'price' };
  const result = applyFilters(places, filters, null);
  // nessuno ha un prezzo mostrato: il comparatore price ricade sul voto
  assert.deepEqual(result.map((p) => p.id), ['b', 'a']);
});
