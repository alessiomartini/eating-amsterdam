// Lo storico dei prezzi funziona come nelle app dei carburanti: conta l'ultimo,
// ma un salto rispetto ai precedenti va segnalato invece che nascosto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarisePrices, estimate, itemApplies } from '../assets/js/items.js';

const price = (amount, date, by = 'anon') => ({ amount, date, by });

test('vale l\'ultimo prezzo, non la media', () => {
  const s = summarisePrices([price(7, '2026-01-01'), price(8, '2026-06-01'), price(9, '2026-09-01')]);
  assert.equal(s.amount, 9);
  assert.equal(s.date, '2026-09-01');
  assert.equal(s.samples, 3);
  assert.equal(s.uncertain, false);
});

test('un salto rispetto ai precedenti si segnala', () => {
  const s = summarisePrices([price(8, '2026-01-01'), price(8, '2026-02-01'), price(25, '2026-09-01')]);
  assert.equal(s.amount, 25, 'il prezzo si mostra comunque');
  assert.equal(s.uncertain, true);
  assert.equal(s.reference, 8);
});

test('anche un crollo è sospetto', () => {
  const s = summarisePrices([price(10, '2026-01-01'), price(10, '2026-02-01'), price(3, '2026-09-01')]);
  assert.equal(s.uncertain, true);
});

test('un rincaro normale non è sospetto', () => {
  const s = summarisePrices([price(7, '2026-01-01'), price(7.5, '2026-02-01'), price(8, '2026-09-01')]);
  assert.equal(s.uncertain, false);
});

test('con pochi dati non si giudica', () => {
  // due prezzi non bastano a sapere quale sia quello strano
  const s = summarisePrices([price(5, '2026-01-01'), price(30, '2026-09-01')]);
  assert.equal(s.amount, 30);
  assert.equal(s.uncertain, false);
});

test('lo storico resta disponibile, in ordine', () => {
  const s = summarisePrices([price(9, '2026-09-01'), price(7, '2026-01-01')]);
  assert.deepEqual(s.history.map((p) => p.amount), [7, 9]);
});

test('birra e piatto economico valgono anche nei pub', () => {
  const pub = { category: 'pub', cuisines: [], lat: 52.37, lon: 4.89 };
  assert.equal(itemApplies('beer', pub), true);
  assert.equal(itemApplies('main', pub), true);
  assert.ok(estimate('beer', pub).amount > 0);
});

test('le voci nuove compaiono dove ha senso', () => {
  const snackbar = { category: 'fast_food', cuisines: ['friture'], lat: 52.37, lon: 4.89 };
  const gelateria = { category: 'ice_cream', cuisines: [], lat: 52.37, lon: 4.89 };
  const cocktailBar = { category: 'bar', cuisines: [], lat: 52.37, lon: 4.89 };
  const ristorante = { category: 'restaurant', cuisines: ['french'], lat: 52.37, lon: 4.89 };

  assert.equal(itemApplies('fries', snackbar), true);
  assert.equal(itemApplies('fries', ristorante), false, 'il friet non è una voce da ristorante');
  assert.equal(itemApplies('icecream', gelateria), true);
  assert.equal(itemApplies('icecream', snackbar), false);
  assert.equal(itemApplies('cocktail', cocktailBar), true);
  assert.equal(itemApplies('cocktail', snackbar), false, 'i cocktail non si bevono in un chiosco di friet');

  assert.ok(estimate('fries', snackbar).amount > 1);
  assert.ok(estimate('icecream', gelateria).amount > 1);
});
