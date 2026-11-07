// Le risposte di Commons/Wikidata sono annidate e piene di HTML: i fixture qui sotto
// riproducono la forma reale delle risposte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fileTitleFromRef, categoryFromRef, categoryMatchesName, parseWikidataImages, parseCategoryFirstFile,
  parseImageInfo, stripHtml,
} from '../scripts/commons.js';
import { photoRefFromTags } from '../scripts/osm-common.js';

const imageInfo = (over = {}) => ({
  query: {
    pages: {
      123: {
        pageid: 123, ns: 6, title: 'File:Restaurant Rijks 01.jpg',
        imageinfo: [{
          thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/21/Restaurant_Rijks_01.jpg/960px-Restaurant_Rijks_01.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo',
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Restaurant_Rijks_01.jpg',
          mime: 'image/jpeg',
          extmetadata: {
            Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Foo" title="User:Foo">Foo &amp; Bar</a>' },
            LicenseShortName: { value: 'CC BY-SA 4.0' },
            LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
          },
        }],
        ...over,
      },
    },
  },
});

test('parseImageInfo estrae miniatura, autore, licenza e pagina del file', () => {
  const photo = parseImageInfo(imageInfo());
  assert.deepEqual(photo, {
    title: 'File:Restaurant Rijks 01.jpg',
    thumb: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/21/Restaurant_Rijks_01.jpg/960px-Restaurant_Rijks_01.jpg',
    author: 'Foo & Bar',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Restaurant_Rijks_01.jpg',
  });
});

test('parseImageInfo scarta file mancanti, senza licenza o non immagini', () => {
  assert.equal(parseImageInfo({ query: { pages: { '-1': { title: 'File:X.jpg', missing: '' } } } }), null);
  assert.equal(parseImageInfo({}), null);
  const noLicense = imageInfo();
  delete noLicense.query.pages[123].imageinfo[0].extmetadata.LicenseShortName;
  assert.equal(parseImageInfo(noLicense), null);
  const pdf = imageInfo();
  pdf.query.pages[123].imageinfo[0].mime = 'application/pdf';
  assert.equal(parseImageInfo(pdf), null);
  const foreign = imageInfo();
  foreign.query.pages[123].imageinfo[0].thumburl = 'https://evil.example/x.jpg';
  assert.equal(parseImageInfo(foreign), null);
});

test('parseImageInfo ripiega su Credit e poi su "Unknown author"', () => {
  const credit = imageInfo();
  delete credit.query.pages[123].imageinfo[0].extmetadata.Artist;
  credit.query.pages[123].imageinfo[0].extmetadata.Credit = { value: '<span>Own work</span>' };
  assert.equal(parseImageInfo(credit).author, 'Own work');
  delete credit.query.pages[123].imageinfo[0].extmetadata.Credit;
  assert.equal(parseImageInfo(credit).author, 'Unknown author');
});

test('stripHtml toglie i tag e decodifica le entità', () => {
  assert.equal(stripHtml('<b>A</b> &lt;B&gt;  &amp; C'), 'A <B> & C');
  assert.equal(stripHtml(undefined), '');
});

test('parseWikidataImages preferisce il claim preferred e ignora i deprecati', () => {
  const claim = (value, rank) => ({ rank, mainsnak: { datavalue: { value } } });
  const json = {
    entities: {
      Q1: { claims: { P18: [claim('A_b.jpg', 'normal'), claim('C.jpg', 'preferred')] } },
      Q2: { claims: { P18: [claim('Old.jpg', 'deprecated')] } },
      Q3: { claims: {} },
      Q4: { missing: '' },
    },
  };
  assert.deepEqual(parseWikidataImages(json), { Q1: 'File:C.jpg' });
  assert.deepEqual(parseWikidataImages({ entities: { Q1: { claims: { P18: [claim('A_b.jpg', 'normal')] } } } }), { Q1: 'File:A b.jpg' });
});

test('parseCategoryFirstFile prende il primo file', () => {
  const json = { query: { categorymembers: [{ ns: 14, title: 'Category:Sub' }, { ns: 6, title: 'File:One.jpg' }] } };
  assert.equal(parseCategoryFirstFile(json), 'File:One.jpg');
  assert.equal(parseCategoryFirstFile({ query: { categorymembers: [] } }), null);
});

test('fileTitleFromRef e categoryFromRef leggono i tag OSM', () => {
  assert.equal(fileTitleFromRef('File:Foo_bar.jpg'), 'File:Foo bar.jpg');
  assert.equal(fileTitleFromRef('https://commons.wikimedia.org/wiki/File:Foo_bar.jpg'), 'File:Foo bar.jpg');
  assert.equal(fileTitleFromRef('https://commons.wikimedia.org/wiki/Special:FilePath/Foo%20bar.jpg'), 'File:Foo bar.jpg');
  assert.equal(fileTitleFromRef('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foo_bar.jpg/800px-Foo_bar.jpg'), 'File:Foo bar.jpg');
  assert.equal(fileTitleFromRef('https://example.com/a.jpg'), null);
  assert.equal(fileTitleFromRef('Category:Foo'), null);
  assert.equal(categoryFromRef('Category:Café_X'), 'Category:Café X');
  assert.equal(categoryFromRef('File:A.jpg'), null);
});

test('una categoria vale solo se porta il nome del locale', () => {
  assert.equal(categoryMatchesName("Category:Café 't Mandje", "'t Mandje"), true);
  assert.equal(categoryMatchesName('Category:Restaurant Rijks', 'Rijks'), true);
  assert.equal(categoryMatchesName('Category:Groot Laboratorium', 'Café De Schelp'), false);
  assert.equal(categoryMatchesName('Category:Zeedijk 1, Amsterdam', "In't Aepjen"), false);
});

test('photoRefFromTags tiene solo riferimenti Wikimedia validi', () => {
  assert.deepEqual(photoRefFromTags({ wikidata: 'Q42', wikimedia_commons: 'Category:X', image: 'https://commons.wikimedia.org/wiki/File:A.jpg' }),
    { wikidata: 'Q42', commons: 'Category:X', image: 'https://commons.wikimedia.org/wiki/File:A.jpg' });
  assert.equal(photoRefFromTags({ wikidata: 'nope', image: 'https://example.com/a.jpg' }), null);
  assert.equal(photoRefFromTags({}), null);
});
