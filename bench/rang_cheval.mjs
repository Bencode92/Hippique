/* Hypothèse de Benoit (15/09, trois captures) : le rang France Galop du CHEVAL
 * porte une information que la cote n'a pas — un favori mal classé se fait
 * battre, le cheval le mieux classé de la course gagne.
 *
 * Écrit avant de regarder :
 *   1. le cheval le mieux classé de la course (rang FG le plus bas, snapshot daté)
 *      gagne-t-il plus souvent que sa cote ne le promet ?  (réel / promis, ROI)
 *   2. le favori gagne-t-il plus quand il est AUSSI le mieux classé, et moins
 *      quand il est mal classé (hors top 3 de la course par le rang) ?
 *   3. en classement pur : Top1 du « meilleur rang cheval » contre Top1 de la cote.
 * Univers : FR plat depuis le 16/04/2026, snapshot daté, dividende ≈ cote.
 *
 *     node bench/rang_cheval.mjs
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = require(path.join(ROOT, 'js', 'matching.js'));
const fr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hippos_filter.json'), 'utf8')).whitelist_fr;
const hippoFr = f => { const h = f.replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/\.json$/, '').replace(/_/g, '-'); return fr.some(w => h.startsWith(w)); };
const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.\-]/g, '')); return isFinite(x) ? x : 0; };
function lireCSV(f) { if (!fs.existsSync(f)) return []; const L = fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim()); const c = L[0].split('\t'); return L.slice(1).map((l, i) => { const r = Object.fromEntries(l.split('\t').map((v, j) => [c[j], v])); r.Rang = i + 1; return r; }); }
const SNAPS = fs.readdirSync(path.join(ROOT, 'data/rankings')).filter(d => /^\d{4}-\d{2}-\d{2}_/.test(d)).sort();
const cache = new Map();
const STRICT = !process.argv.includes('--egal');   // strictement antérieur par défaut (fuite du snapshot de l'après-midi) ; --egal pour l'ancienne convention
const R2025 = process.argv.includes('--2025');    // classement 2025 seul (aucune fuite possible)
function snap(date) { let ch = null; for (const s of SNAPS) if (STRICT ? s.slice(0, 10) < date : s.slice(0, 10) <= date) ch = s; if (!ch) return null; if (!cache.has(ch)) cache.set(ch, { i26: M.creerIndex(lireCSV(path.join(ROOT, 'data/rankings', ch, 'chevaux.csv')), 'chevaux'), i25: M.creerIndex(lireCSV(path.join(ROOT, 'data/rankings', ch, 'chevaux_2025.csv')), 'chevaux') }); return cache.get(ch); }

const rows = []; let nC = 0;
for (const f of fs.readdirSync(path.join(ROOT, 'data/courses')).filter(f => f.endsWith('.json') && f.slice(0, 10) >= '2026-04-16' && hippoFr(f)).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/courses', f), 'utf8'));
  if ((d.type_reunion || '').toLowerCase() !== 'plat') continue;
  const S = snap(f.slice(0, 10)); if (!S) continue;
  for (const c of d.courses || []) {
    if ((c.type || 'Plat').toUpperCase() !== 'PLAT') continue;
    const ps = (c.participants || []).filter(p => num(p.cote) > 1);
    if (ps.length < 5 || !ps.some(p => num(p.arrivee) === 1)) continue;
    const inv = ps.reduce((s, p) => s + 1 / num(p.cote), 0); if (inv < 1.05 || inv > 1.6) continue;
    nC++;
    const fav = Math.min(...ps.map(p => num(p.cote)));
    const L = ps.map(p => { const r = R2025 ? null : M.rattacher(S.i26, p.cheval, 'chevaux'); const r25 = r ? null : M.rattacher(S.i25, p.cheval, 'chevaux'); return { date: f.slice(0, 7), nom: M.parseCheval(p.cheval).nom, cote: num(p.cote), win: num(p.arrivee) === 1, rang: r ? r.item.Rang : (r25 ? r25.item.Rang + 10000 : 99999), trouve: !!r, fav: num(p.cote) === fav, n: ps.length, inv }; });
    // FUITE ÉVITÉE : data/courses liste les partants dans l'ordre d'ARRIVÉE une fois la
    // course courue. Un tri stable sur des rangs égaux (introuvables = 99999) prenait
    // le premier de la liste — le gagnant. Départage par numéro, et un cheval
    // introuvable au classement n'est jamais « le mieux classé ».
    L.forEach((x, i) => { x.num = num(ps[i]['n°']) || i + 1; });
    const parRang = [...L].sort((a, b) => a.rang - b.rang || a.num - b.num);
    L.forEach(x => { x.posRang = parRang.indexOf(x) + 1; x.meilleurRang = parRang[0] === x && x.rang < 99999 && !(parRang[1] && parRang[1].rang === x.rang); });
    rows.push(...L);
  }
}
const g = r => r.win ? r.cote - 1 : -1;
function ligne(lib, sel) { const n = sel.length; if (n < 30) { console.log(`   ${lib.padEnd(58)} n=${n} (trop peu)`); return; } const gains = sel.map(g); const roi = gains.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(gains.reduce((a, b) => a + (b - roi) ** 2, 0) / (n - 1)); const w = sel.filter(r => r.win).length; const prom = sel.reduce((a, r) => a + 1 / r.cote / r.inv, 0); console.log(`   ${lib.padEnd(58)} ROI ${(100 * roi).toFixed(1).padStart(6)} % ± ${(100 * sd / Math.sqrt(n)).toFixed(1).padStart(4)}   réel/promis ${(w / prom).toFixed(2)}   n=${String(n).padStart(6)}   touche ${(100 * w / n).toFixed(1)} %`); }
console.log(`${STRICT ? 'SNAPSHOT STRICTEMENT ANTÉRIEUR · ' : ''}${R2025 ? 'CLASSEMENT 2025 SEUL · ' : ''}${nC} courses FR plat depuis le 16/04/2026, ${rows.length} partants, rang cheval retrouvé pour ${(100 * rows.filter(r => r.trouve).length / rows.length).toFixed(0)} %\n`);
console.log('══ 1. le cheval le mieux classé de la course (rang FG), quelle que soit sa cote');
ligne('le mieux classé de la course', rows.filter(r => r.meilleurRang));
ligne('   … et il est le favori', rows.filter(r => r.meilleurRang && r.fav));
ligne('   … et il n\'est PAS le favori', rows.filter(r => r.meilleurRang && !r.fav));
ligne('2e mieux classé', rows.filter(r => r.posRang === 2));
ligne('le plus mal classé de la course', rows.filter(r => r.posRang === r.n));
ligne('tous les partants (référence)', rows);
console.log('\n══ 2. le favori, selon son rang cheval DANS la course');
ligne('favori, mieux classé de la course', rows.filter(r => r.fav && r.posRang === 1));
ligne('favori, 2e ou 3e par le rang', rows.filter(r => r.fav && r.posRang >= 2 && r.posRang <= 3));
ligne('favori, hors top 3 par le rang', rows.filter(r => r.fav && r.posRang > 3));
ligne('favori, dans la moitié basse par le rang', rows.filter(r => r.fav && r.posRang > r.n / 2));
ligne('tous les favoris', rows.filter(r => r.fav));
console.log('\n══ 3. classement pur : le n°1 par le rang cheval contre le n°1 par la cote');
const courses = new Map(); rows.forEach(r => { const k = r.inv + '|' + r.n; (courses.get(k) || courses.set(k, []).get(k)).push(r); });
let t1r = 0, t1c = 0, t3r = 0, t3c = 0, N = 0;
for (const L of courses.values()) { N++; const byR = [...L].sort((a, b) => a.rang - b.rang || a.cote - b.cote), byC = [...L].sort((a, b) => a.cote - b.cote); if (byR[0].win) t1r++; if (byC[0].win) t1c++; if (byR.slice(0, 3).some(x => x.win)) t3r++; if (byC.slice(0, 3).some(x => x.win)) t3c++; }
console.log(`   Top1  rang cheval ${(100 * t1r / N).toFixed(1)} %   cote ${(100 * t1c / N).toFixed(1)} %      Top3  rang cheval ${(100 * t3r / N).toFixed(1)} %   cote ${(100 * t3c / N).toFixed(1)} %   (${N} courses)`);

console.log('\n══ 4. le mieux classé non favori, par mois');
for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) ligne(`   ${m}`, rows.filter(r => r.meilleurRang && !r.fav && r.date === m));

if (process.argv.includes('--debug')) {
  console.log('\n══ DEBUG : les gagnants « mieux classé non favori », par cote décroissante');
  const sel = rows.filter(r => r.meilleurRang && !r.fav && r.win).sort((a, b) => b.cote - a.cote).slice(0, 12);
  for (const r of sel) console.log(`   ${r.date}  cote ${String(r.cote).padStart(5)}  rang ${r.rang}  n=${r.n}  ${r.nom || ''}`);
  const sel2 = rows.filter(r => r.meilleurRang && !r.fav);
  console.log(`   cote moyenne des ${sel2.length} paris : ${(sel2.reduce((a, r) => a + r.cote, 0) / sel2.length).toFixed(1)} ; cote moyenne des gagnants : ${(sel2.filter(r => r.win).reduce((a, r) => a + r.cote, 0) / sel2.filter(r => r.win).length).toFixed(1)}`);
  console.log(`   distribution des rangs des « mieux classés » : ${[...new Set(sel2.map(r => r.rang >= 99999 ? 'introuvable' : r.rang >= 10000 ? '2025' : '2026'))].join(', ')} ; introuvables : ${sel2.filter(r => r.rang >= 99999).length}`);
}
