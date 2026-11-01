import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKikenList, parseCountryPage, infectionCountries, NATIONWIDE } from '../scripts/safety-parse.mjs';

test('危険情報一覧からリンク名を拾う', () => {
  const names = parseKikenList('<ul><li><a href="x">タイ<img alt="別ウインドウ"></a></li><li><a href="y"> シリア </a></li></ul>');
  assert.ok(names.has('タイ') && names.has('シリア'));
});

test('一部地域だけのレベルは掲載を続けられる', () => {
  const html = `<h2>危険情報</h2><p>【危険度】</p><p>●カンボジア国境から３０ｋｍ以内の地域<br>　レベル３：渡航は止めてください。</p><p>●ソンクラー県（上記３郡を除く）<br>レベル２：不要不急の渡航は止めてください。</p><h2>感染症危険情報</h2><p>現在、感染症危険情報は出ておりません。</p>`;
  const r = parseCountryPage(html);
  assert.equal(r.maxLevel, 3);
  assert.equal(NATIONWIDE.test(r.block.join('\n')), false);
  assert.equal(r.block.join('\n').includes('バンコク'), false);
});

test('「上記以外の地域」にレベルが出ていれば検出する', () => {
  const html = `<h2>危険情報</h2><p>中部パプア州：レベル２</p><p>上記以外の全地域：レベル１：十分注意してください。</p>`;
  assert.ok(NATIONWIDE.test(parseCountryPage(html).block.join('\n')));
});

test('危険情報なしを読み取る', () => {
  const r = parseCountryPage('<p>危険情報</p><p>現在、危険情報は出ておりません。</p>');
  assert.equal(r.noDanger, true);
});

test('感染症危険情報の対象国を拾う（終息は除く）', () => {
  const html = `<li>2026年05月17日 ウガンダ<br>エボラ出血熱に関する感染症危険情報（レベル１）の発出</li><li>韓国<br>○○に関する感染症危険情報（レベル１）の解除</li>`;
  const hits = infectionCountries(html, [
    { id: 'uganda', safety: { mofaNames: ['ウガンダ'] } },
    { id: 'korea', safety: { mofaNames: ['韓国'] } },
  ]);
  assert.deepEqual([...hits], ['uganda']);
});
