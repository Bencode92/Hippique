/* Les combinés choisis par l'Optimale battent-ils ceux du marché ?
 *
 * La grille optimise le Top3 ; ses champions ne battent pas la cote au gagnant
 * hors échantillon, mais personne n'a mesuré leurs COUPLÉS et TRIOS. Ici : pour
 * chaque course premium depuis le 16/04/2026, le top 2 / top 3 selon (a) la cote,
 * (b) les champions de l'export de Benoit du 15/09 (en échantillon, donc
 * OPTIMISTES pour eux), (c) le champion « tous » validé hors échantillon.
 * Simple gagnant sur le n°1, couplé gagnant et placé des 2 premiers, trio des
 * 3 premiers, avec les dividendes réels (data/rapports, joints par date +
 * hippodrome + numéro de course).
 *
 *     node bench/combines_optimale.mjs
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = require(path.join(ROOT, 'js', 'matching.js'));
const PREMIUM = new Set(['PARISLONGCHAMP', 'SAINT-CLOUD', 'CHANTILLY', 'FONTAINEBLEAU', 'DEAUVILLE', 'LYON-PARILLY']);
const norm = h => (h || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.\-]/g, '')); return isFinite(x) ? x : 0; };

// ── leviers : même code que la grille (bench/grille_walkforward.mjs)
function lireCSV(f) { if (!fs.existsSync(f)) return []; const L = fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim()); const c = L[0].split('\t'); return L.slice(1).map((l, i) => { const r = Object.fromEntries(l.split('\t').map((v, j) => [c[j], v])); r.Rang = i + 1; const pa = num(r.Partants || r.Courses), v = num(r.Victoires), pl = num(r.Places), al = num(r['Allocation tot.']); r.TauxVictoire = pa > 0 ? +(v / pa * 100).toFixed(1) : 0; r.TauxPlace = pa > 0 ? +(pl / pa * 100).toFixed(1) : 0; r.GainMoyen = pa > 0 ? +(al / pa).toFixed(2) : 0; r.ScoreMixte = r.TauxVictoire; return r; }); }
const SNAPS = fs.readdirSync(path.join(ROOT, 'data/rankings')).filter(d => /^\d{4}-\d{2}-\d{2}_/.test(d)).sort();
const cache = new Map();
function snapPour(date) { let ch = null; for (const s of SNAPS) if (s.slice(0, 10) < date) ch = s; if (!ch) return null; if (cache.has(ch)) return cache.get(ch); const dir = path.join(ROOT, 'data/rankings', ch), S = {}; for (const [k, f, cat] of [['jk26', 'jockeys.csv', 'jockeys'], ['jk25', 'jockeys_2025.csv', 'jockeys'], ['chx26', 'chevaux.csv', 'chevaux'], ['chx25', 'chevaux_2025.csv', 'chevaux']]) { const rows = lireCSV(path.join(dir, f)); S[k] = { idx: M.creerIndex(rows, cat), pop: rows.length || 1, cat }; } cache.set(ch, S); return S; }
const trouve = (s, nom) => { const r = M.rattacher(s.idx, nom, s.cat); return r ? r.item : null; };
function leviers(p, S) {
  const jk = p.jockey || '', ch = p.cheval || '';
  const j25 = trouve(S.jk25, jk), j26 = trouve(S.jk26, jk), ch25 = trouve(S.chx25, ch), ch26 = trouve(S.chx26, ch);
  const coteVal = num(p.cote), coteRef = num(p.cote_reference), valeur = num(p.valeur), nbC = parseInt(p.nb_courses) || 0, nbV = parseInt(p.nb_victoires) || 0;
  const mxF = (a, b, f) => Math.max(a ? num(a[f]) : 0, b ? num(b[f]) : 0);
  const gm = (a, b) => Math.max(a?.GainMoyen || 0, b?.GainMoyen || 0);
  return { 'Cote (1/cote)': coteVal > 1 ? 100 / coteVal : 50, 'Cote ref': coteRef > 1 ? 100 / coteRef : 50, 'Valeur FG': valeur > 0 ? valeur : 50,
    'TauxV indiv': nbC >= 2 ? nbV / nbC * 100 : 8, 'Jk TauxV': mxF(j25, j26, 'TauxVictoire') || 8, 'Jk GainMoy': gm(j25, j26) > 0 ? Math.log10(gm(j25, j26)) * 15 : 0 };
}
// ── les formules comparées
const FORMULES = {
  'marché (cote seule)':                     () => ({ 'Cote (1/cote)': 1 }),
  'export Benoit, champions en échantillon': dist => dist >= 1600 && dist <= 1699 ? { 'Cote (1/cote)': .6, 'Cote ref': .1, 'Jk TauxV': .3 } : dist >= 2200 && dist <= 2500 ? { 'Cote (1/cote)': .3, 'Valeur FG': .6, 'Jk TauxV': .1 } : { 'Cote (1/cote)': 1 },
  'champion « tous » (Cote 80 + Val 10 + JkGM 10)': () => ({ 'Cote (1/cote)': .8, 'Valeur FG': .1, 'Jk GainMoy': .1 }),
  'champion 2400m partout (Cote 30 + Val 60 + TxVind 10)': () => ({ 'Cote (1/cote)': .3, 'Valeur FG': .6, 'TauxV indiv': .1 }),
};
// ── rapports réels, joints par date | hippodrome | numéro de course
const rap = new Map();
for (const f of fs.readdirSync(path.join(ROOT, 'data/rapports')).filter(x => x.endsWith('.jsonl')))
  for (const l of fs.readFileSync(path.join(ROOT, 'data/rapports', f), 'utf8').split('\n')) { if (!l.trim()) continue; const d = JSON.parse(l); rap.set(`${d.date}|${norm(d.hip)}|${d.c}`, d.paris); }
const tab = p => Object.fromEntries((p || []).map(x => [x.comb.split('-').sort().join('-'), x.div / 100]));

const res = {}; for (const k of Object.keys(FORMULES)) res[k] = { sg: [], cg: [], cp: [], trio: [], n: 0 };
let nC = 0;
for (const f of fs.readdirSync(path.join(ROOT, 'data/courses')).filter(f => f.endsWith('.json') && f.slice(0, 10) >= '2026-04-16').sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/courses', f), 'utf8'));
  if ((d.type_reunion || '').toLowerCase() !== 'plat' || !PREMIUM.has((d.hippodrome || '').toUpperCase())) continue;
  const S = snapPour(f.slice(0, 10)); if (!S) continue;
  for (const c of d.courses || []) {
    if ((c.type || 'Plat').toUpperCase() !== 'PLAT') continue;
    const ps = (c.participants || []).filter(p => num(p.cote) > 1);
    if (ps.length < 8 || !ps.some(p => num(p.arrivee) === 1)) continue;
    const inv = ps.reduce((s, p) => s + 1 / num(p.cote), 0); if (inv < 1.05 || inv > 1.6) continue;
    const R = rap.get(`${f.slice(0, 10)}|${norm(d.hippodrome)}|${num(c.numero)}`); if (!R || !R.E_SIMPLE_GAGNANT) continue;
    const SG = tab(R.E_SIMPLE_GAGNANT), CG = tab(R.E_COUPLE_GAGNANT), CP = tab(R.E_COUPLE_PLACE), TR = tab(R.E_TRIO);
    nC++;
    const L = ps.map(p => ({ n: String(num(p['n°'])), cote: num(p.cote), lev: leviers(p, S) }));
    for (const [nom, fn] of Object.entries(FORMULES)) {
      const w = fn(num(c.distance));
      const sc = x => Object.entries(w).reduce((s, [k, v]) => s + (x.lev[k] || 0) * v, 0);
      const ord = [...L].sort((a, b) => sc(b) - sc(a) || a.cote - b.cote);   // même départage que la grille : score puis cote
      const r = res[nom]; r.n++;
      r.sg.push((SG[ord[0].n] || 0) - 1);
      const k2 = [ord[0].n, ord[1].n].sort().join('-'); r.cg.push((CG[k2] || 0) - 1); r.cp.push((CP[k2] || 0) - 1);
      if (R.E_TRIO) r.trio.push((TR[[ord[0].n, ord[1].n, ord[2].n].sort().join('-')] || 0) - 1);
    }
  }
}
const cell = a => { if (!a.length) return '      —      '; const m = a.reduce((s, x) => s + x, 0) / a.length; const sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); return `${(100 * m).toFixed(1).padStart(6)} % ±${(100 * sd / Math.sqrt(a.length)).toFixed(0).padStart(3)}`; };
console.log(`${nC} courses premium de 8 partants et plus depuis le 16/04/2026, dividendes réels\n`);
console.log(''.padEnd(54) + 'simple n°1'.padStart(16) + 'couplé G top2'.padStart(16) + 'couplé P top2'.padStart(16) + 'trio top3'.padStart(16));
for (const [nom, r] of Object.entries(res)) console.log(nom.padEnd(54) + cell(r.sg).padStart(16) + cell(r.cg).padStart(16) + cell(r.cp).padStart(16) + cell(r.trio).padStart(16));
