// Lo scraper legge menu veri, scritti da esseri umani in olandese e in inglese:
// i casi qui sotto sono le forme che si incontrano davvero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractItems, findItemPrice, findSectionPrice, htmlToLines, pricesIn, findMenuLinks, isAllowedByRobots,
  decodeEntities,
} from '../scripts/menu-parse.js';

test('riconosce i formati di prezzo olandesi e inglesi', () => {
  assert.deepEqual(pricesIn('Koffie € 3,50'), [3.5]);
  assert.deepEqual(pricesIn('Espresso 2.80 euro'), [2.8]);
  assert.deepEqual(pricesIn('Pizza margherita €12,-'), [12]);
  assert.deepEqual(pricesIn('Biertje 5,20'), [5.2]);
});

test('ignora i numeri che non sono prezzi', () => {
  // "4,-" senza simbolo di valuta è ambiguo: meglio perderlo che inventarlo
  assert.deepEqual(pricesIn('Bel ons: 020 555 12 34'), []);
  assert.deepEqual(pricesIn('Sinds 1998'), []);
  assert.deepEqual(pricesIn('Openingstijden 11,-'), []);
});

test('scarta i prezzi implausibili per la voce', () => {
  const lines = ['Koffie met gebak € 45,00'];
  assert.equal(findItemPrice(lines, 'coffee'), null, 'un caffè a 45 € non è un caffè');
});

test('prende il più economico fra più prezzi della stessa voce', () => {
  const lines = ['Koffie € 3,20', 'Koffie speciaal € 4,80', 'Espresso € 2,90'];
  assert.equal(findItemPrice(lines, 'coffee'), 2.9);
});

test('legge il piatto più economico di una sezione', () => {
  const lines = [
    'Voorgerechten',
    'Soep van de dag € 6,50',
    'Carpaccio € 12,00',
    'Hoofdgerechten',
    'Schnitzel € 18,50',
    'Zeebaars € 24,00',
  ];
  assert.equal(findSectionPrice(lines, 'first'), 6.5);
  assert.equal(findSectionPrice(lines, 'main'), 18.5);
});

test('una sezione finisce dove comincia la successiva', () => {
  const lines = ['Starters', 'Bruschetta € 7,00', 'Main courses', 'Pasta € 9,00'];
  assert.equal(findSectionPrice(lines, 'first'), 7, 'la pasta da 9 € è un secondo, non un antipasto');
});

test('estrae le voci da una pagina HTML realistica', () => {
  const html = `
    <html><body>
      <nav><a href="/menukaart">Menukaart</a></nav>
      <style>.p { color: red } /* € 99,00 */</style>
      <h2>Dranken</h2>
      <ul><li>Koffie<span>€ 3,00</span></li><li>Pils 0,25l <span>€ 5,00</span></li></ul>
      <h2>Voorgerechten</h2>
      <p>Tomatensoep &euro; 5,50</p>
      <h2>Hoofdgerechten</h2>
      <p>D&ouml;ner kebab schotel &euro; 13,50</p>
      <p>Pizza margherita &euro; 11,00</p>
    </body></html>`;
  const items = extractItems(html);
  assert.equal(items.coffee, 3);
  assert.equal(items.beer, 5);
  assert.equal(items.doner, 13.5);
  assert.equal(items.pizza, 11);
  assert.equal(items.first, 5.5);
  assert.equal(items.main, 11, 'il più economico dei secondi');
});

test('il CSS e gli script non finiscono nel testo', () => {
  const lines = htmlToLines('<script>var p = "€ 1,00"</script><p>Koffie € 3,00</p>');
  assert.equal(lines.join(' ').includes('1,00'), false);
});

test('trova i link al menu e resta sullo stesso dominio', () => {
  const html = `<a href="/menukaart">Onze kaart</a>
                <a href="https://facebook.com/menu">Facebook</a>
                <a href="mailto:a@b.nl">Mail</a>
                <a href="/contact">Contact</a>`;
  const links = findMenuLinks(html, 'https://voorbeeld.nl/');
  assert.deepEqual(links, ['https://voorbeeld.nl/menukaart']);
});

test('rispetta robots.txt', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/menu\n';
  assert.equal(isAllowedByRobots(robots, '/menukaart'), true);
  assert.equal(isAllowedByRobots(robots, '/private/kaart'), false);
  assert.equal(isAllowedByRobots(robots, '/private/menu'), true, 'la regola più specifica vince');
  assert.equal(isAllowedByRobots('User-agent: *\nDisallow: /\n', '/menu'), false);
  assert.equal(isAllowedByRobots('', '/menu'), true);
});

test('gli accenti scritti come entità non spezzano le parole chiave', () => {
  // caso reale: senza decodifica "D&ouml;ner" diventava "D ner" e la riga
  // veniva ignorata, facendo vincere un piatto più caro della stessa sezione
  const html = '<p>D&ouml;ner in pita &euro; 7,50</p><p>Shoarma &euro; 8,00</p>';
  assert.equal(extractItems(html).doner, 7.5);
  assert.equal(decodeEntities('Cr&egrave;me br&ucirc;l&eacute;e'), 'Crème brûlée');
  assert.equal(decodeEntities('caf&#233; &#x2014; 3'), 'café — 3');
});

test('una sezione finisce anche a un\'intestazione non di piatti', () => {
  // caso reale trovato sui menu di Amsterdam: senza questo la sezione non
  // finiva mai e il "primo più economico" diventava il caffè della sezione bevande
  const lines = ['Voorgerechten', 'Carpaccio € 12,00', 'Dranken', 'Koffie € 2,50', 'Cola € 3,00'];
  assert.equal(findSectionPrice(lines, 'first'), 12);
});

test('scarta primi e secondi incoerenti fra loro', () => {
  const html = `<p>Voorgerechten</p><p>Soep € 9,00</p><p>Hoofdgerechten</p><p>Broodje € 8,00</p>`;
  const items = extractItems(html);
  assert.equal(items.first, undefined, 'un secondo più economico del primo significa sezioni sbagliate');
  assert.equal(items.main, undefined);
});

test('una bevanda non viene scambiata per un piatto', () => {
  const lines = ['Starters', 'Huisgemaakte limonade € 2,50', 'Bruschetta € 7,50'];
  assert.equal(findSectionPrice(lines, 'first'), 7.5);
});

test('un caffè con dolce non passa per un caffè', () => {
  assert.equal(findItemPrice(['Koffie met gebak € 8,00'], 'coffee'), null);
  assert.equal(findItemPrice(['Koffie € 3,20', 'Koffie met gebak € 8,00'], 'coffee'), 3.2);
});
