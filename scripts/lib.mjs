import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const p = (...s) => path.join(ROOT, ...s);

export function readJSON(rel, fallback) {
  try { return JSON.parse(fs.readFileSync(p(rel), 'utf8')); }
  catch (e) { if (fallback !== undefined) return fallback; throw e; }
}
export function writeJSON(rel, data) {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), JSON.stringify(data, null, 2) + '\n');
}
export const today = () => new Date().toISOString().slice(0, 10);

// HTMLからタグを除いた行の配列を返す
export function htmlToLines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/dt|\/dd)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
// 全角数字を半角に
export const toHalf = s => s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));

export function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

// 国・地域（data/countries.json）と人気の都市（data/cities.json）をまとめて返す。
// 動画・写真・概要文の収集はどちらも同じ扱い。都市には kind: 'city' と country（親の国ID）が付く。
export function loadPlaces() {
  return [
    ...readJSON('data/countries.json'),
    ...readJSON('data/cities.json', []).map(c => ({ ...c, kind: 'city' })),
  ];
}
