// Il parser di opening_hours è la parte con più casi limite del progetto:
// meglio bloccarne il comportamento, comprese le forme che NON sappiamo leggere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOpenNow, humanize } from '../assets/js/hours.js';

// 2026-09-06 è una domenica: da qui i giorni sono espliciti e leggibili.
const DOM = 0, LUN = 1, MER = 3, SAB = 6;
const at = (weekday, hour, minute = 0) => {
  const d = new Date(2026, 8, 6 + weekday, hour, minute);
  assert.equal(d.getDay(), weekday, 'la data di test non cade nel giorno atteso');
  return d;
};

test('24/7 è sempre aperto', () => {
  assert.equal(isOpenNow('24/7', at(MER, 3)), true);
});

test('intervallo semplice dentro e fuori orario', () => {
  assert.equal(isOpenNow('Mo-Su 11:00-23:00', at(MER, 12)), true);
  assert.equal(isOpenNow('Mo-Su 11:00-23:00', at(MER, 2)), false);
});

test('giorno escluso dalla regola', () => {
  assert.equal(isOpenNow('Mo-Fr 09:00-17:00', at(DOM, 12)), false);
});

test('lista di giorni con la virgola', () => {
  assert.equal(isOpenNow('Sa,Su 16:00-20:30', at(SAB, 17)), true);
  assert.equal(isOpenNow('Sa,Su 16:00-20:30', at(MER, 17)), false);
});

test('chiusura dopo mezzanotte vale anche il giorno dopo', () => {
  const spec = 'Mo-Su 18:00-02:00';
  assert.equal(isOpenNow(spec, at(MER, 23)), true);
  assert.equal(isOpenNow(spec, at(MER, 1)), true, 'l\'una di notte ricade nella sera prima');
  assert.equal(isOpenNow(spec, at(MER, 12)), false);
});

test('regole separate dalla virgola invece che dal punto e virgola', () => {
  // pattern tipico dei kebabbari: 86 locali del dataset di Amsterdam
  const spec = 'Su-Th 11:00-03:00, Fr,Sa 11:00-24:00';
  assert.equal(isOpenNow(spec, at(LUN, 1)), true, 'notte fra domenica e lunedì');
  assert.equal(isOpenNow(spec, at(SAB, 23)), true, 'sabato sera');
  assert.equal(isOpenNow(spec, at(MER, 9)), false, 'mercoledì mattina presto');
});

test('lista di orari nello stesso giorno', () => {
  const spec = 'Mo-Fr 09:00-12:00,14:00-18:00';
  assert.equal(isOpenNow(spec, at(MER, 10)), true);
  assert.equal(isOpenNow(spec, at(MER, 13)), false, 'pausa pranzo');
  assert.equal(isOpenNow(spec, at(MER, 15)), true);
});

test('"off" chiude i giorni indicati', () => {
  assert.equal(isOpenNow('Mo-Su 10:00-20:00; Su off', at(DOM, 12)), false);
});

test('quello che non sappiamo leggere torna null, non una bugia', () => {
  assert.equal(isOpenNow(null), null);
  assert.equal(isOpenNow('Mo-Fr 09:00-17:00; PH off', at(MER, 12)), null, 'festivi: non li sappiamo calcolare');
  assert.equal(isOpenNow('sunrise-sunset', at(MER, 12)), null);
  assert.equal(isOpenNow('quando capita', at(MER, 12)), null);
});

test('gli orari si leggono in inglese, come il resto del sito', () => {
  assert.equal(humanize('Mo-Sa 11:00-22:00; Su 12:00-20:00'), 'Mon-Sat 11:00-22:00 · Sun 12:00-20:00');
  assert.equal(humanize('24/7'), 'always open');
});
