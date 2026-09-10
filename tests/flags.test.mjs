// Un fatto booleano segnalato da più persone: vale l'ultimo, ma un disaccordo
// non va nascosto facendo semplicemente vincere il più recente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summariseFlags } from '../assets/js/flags.js';

const r = (value, date, by = 'anon', note = null) => ({ flag: 'student_discount', value, date, by, note });

test('senza segnalazioni non si afferma niente', () => {
  assert.deepEqual(summariseFlags([]), {});
  assert.equal(summariseFlags([]).student_discount, undefined);
});

test('vale l\'ultima segnalazione', () => {
  const t = summariseFlags([r(true, '2026-01-01'), r(false, '2026-09-01')]).student_discount;
  assert.equal(t.value, false);
  assert.equal(t.date, '2026-09-01');
  assert.equal(t.reports, 2);
});

test('un disaccordo si dichiara invece di nasconderlo', () => {
  const t = summariseFlags([r(true, '2026-01-01'), r(false, '2026-05-01'), r(true, '2026-09-01')]).student_discount;
  assert.equal(t.value, true, 'vince comunque la più recente');
  assert.equal(t.disputed, true);
  assert.equal(t.yes, 2);
  assert.equal(t.no, 1);
});

test('segnalazioni concordi non sono contese', () => {
  const t = summariseFlags([r(true, '2026-01-01'), r(true, '2026-09-01')]).student_discount;
  assert.equal(t.disputed, false);
});

test('la nota mostrata è quella dell\'ultima segnalazione', () => {
  const t = summariseFlags([
    r(true, '2026-01-01', 'anna', '10% con tessera'),
    r(true, '2026-09-01', 'bob', '15% dopo le 18'),
  ]).student_discount;
  assert.equal(t.note, '15% dopo le 18');
  assert.equal(t.by, 'bob');
});

test('i fatti sconosciuti vengono ignorati', () => {
  const t = summariseFlags([{ flag: 'inventato', value: true, date: '2026-09-01' }]);
  assert.deepEqual(t, {});
});
