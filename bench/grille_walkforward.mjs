/* La grille de stats.html, rejouée à l'identique mais honnêtement.
 *
 * Même chose que le bouton « Analyser » : mêmes leviers (mêmes formules de
 * score), même énumération (solo → pool de 12 + noyau → 2 à 6 leviers, poids
 * par pas de 0,1), même champion (Top3, puis Top2, puis Top1, puis simplicité),
 * mêmes buckets, mêmes hippodromes premium, snapshot daté. Deux différences :
 *
 *   1. le rattachement est js/matching.js (celui de stats.html ne lit qu'une
 *      lettre d'initiale : PC.BOUDOT, FH.GRAFFARD (S) → valeur par défaut) ;
 *   2. « Forme récente » et « Combo Jk*Ent » sont RETIRÉS : ces deux fichiers
 *      sont calculés au 05/09/2026 sur toutes les courses, y compris celle
 *      qu'on évalue. Une formule qui les utilise triche sans le savoir.
 *
 * Et surtout : WALK-FORWARD. Pour chaque mois de test, la grille choisit son
 * champion sur les courses ANTÉRIEURES, puis on mesure le champion sur le mois.
 * C'est la seule mesure qui dit si « la formule bat la cote » — le chiffre que
 * stats.html affiche est mesuré sur les courses qui ont servi à la choisir.
 *
 *   node bench/grille_walkforward.mjs            # premium, mois de test juin → sept
 *   node bench/grille_walkforward.mjs --tous     # tous hippodromes FR
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = require(path.join(ROOT, 'js', 'matching.js'));

const TOUS_HIPPOS = process.argv.includes('--tous');
const PREMIUM = new Set(['PARISLONGCHAMP', 'LONGCHAMP', 'SAINT-CLOUD', 'CHANTILLY', 'FONTAINEBLEAU', 'DEAUVILLE', 'LYON-PARILLY']);
const fr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hippos_filter.json'), 'utf8')).whitelist_fr;
const hippoFr = f => { const h = f.replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/\.json$/, '').replace(/_/g, '-'); return fr.some(w => h.startsWith(w)); };
const corresp = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/claude_correspondances.json'), 'utf8'));
const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.\-]/g, '')); return isFinite(x) ? x : 0; };

// ── snapshots datés, lignes enrichies comme loadSnapshotCSV (Rang, TauxVictoire, TauxPlace, GainMoyen, ScoreMixte)
function lireCSV(f) {
  if (!fs.existsSync(f)) return [];
  const lignes = fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim());
  const cols = lignes[0].split('\t');
  return lignes.slice(1).map((l, i) => {
    const r = Object.fromEntries(l.split('\t').map((v, j) => [cols[j], v]));
    r.Rang = i + 1;
    const pa = num(r.Partants || r.Courses), v = num(r.Victoires), pl = num(r.Places), al = num(r['Allocation tot.']);
    r.TauxVictoire = pa > 0 ? +(v / pa * 100).toFixed(1) : 0; r.TauxPlace = pa > 0 ? +(pl / pa * 100).toFixed(1) : 0;
    r.GainMoyen = pa > 0 ? +(al / pa).toFixed(2) : 0; r.ScoreMixte = r.TauxVictoire;
    return r;
  });
}
const SNAPS = fs.readdirSync(path.join(ROOT, 'data/rankings')).filter(d => /^\d{4}-\d{2}-\d{2}_/.test(d)).sort();
const cache = new Map();
function snapPour(date) {
  let choisi = null;
  for (const s of SNAPS) if (s.slice(0, 10) <= date) choisi = s;
  if (!choisi) return null;
  if (cache.has(choisi)) return cache.get(choisi);
  const dir = path.join(ROOT, 'data/rankings', choisi), S = {};
  for (const [k, f, cat] of [['jk26', 'jockeys.csv', 'jockeys'], ['jk25', 'jockeys_2025.csv', 'jockeys'], ['chx26', 'chevaux.csv', 'chevaux'], ['chx25', 'chevaux_2025.csv', 'chevaux'], ['cr26', 'cravache_or.csv', 'jockeys'], ['cr25', 'cravache_or_2025.csv', 'jockeys']]) {
    const rows = lireCSV(path.join(dir, f));
    S[k] = { idx: M.creerIndex(rows, cat, { correspondances: corresp.correspondances }), pop: rows.length || 1, cat };
  }
  cache.set(choisi, S);
  return S;
}
const trouve = (s, nom) => { const r = M.rattacher(s.idx, nom, s.cat); return r ? r.item : null; };

// ── leviers, formules identiques à stats.html (getLeviers), sans Forme récente ni Combo
function parseMusique(m) {
  if (!m) return 50;
  const pos = m.replace(/\(\d+\)/g, '').match(/(\d+|[DRT])[a-z]/gi);
  if (!pos || pos.length < 2) return 50;
  const l = pos.slice(0, 5).map(x => { const v = x.slice(0, -1); if ('DRT'.includes(v)) return 12; const n = parseInt(v); return n === 0 ? 12 : n; });
  let sc = 0, w = 0;
  l.forEach((ps, i) => { const wt = (l.length - i) / l.length; const s = ps === 1 ? 100 : ps === 2 ? 80 : ps === 3 ? 65 : ps <= 5 ? 45 : ps <= 8 ? 25 : 10; sc += s * wt; w += wt; });
  return w > 0 ? sc / w : 50;
}
function leviers(p, S) {
  const jk = p.jockey || '', ch = p.cheval || '';
  const j25 = trouve(S.jk25, jk), j26 = trouve(S.jk26, jk), ch25 = trouve(S.chx25, ch), ch26 = trouve(S.chx26, ch), cr25 = trouve(S.cr25, jk), cr26 = trouve(S.cr26, jk);
  const coteVal = num(p.cote), coteRef = num(p.cote_reference), valeur = num(p.valeur);
  const gains = parseInt(String(p.gains || '').replace(/\D/g, '')) || 0;
  const nbC = parseInt(p.nb_courses) || 0, nbV = parseInt(p.nb_victoires) || 0, nbP = parseInt(p.nb_places) || 0;
  const mxF = (a, b, f) => Math.max(a ? num(a[f]) : 0, b ? num(b[f]) : 0);
  const rS = (it, pp) => it ? 100 * (1 - (it.Rang - 1) / pp) : 50;
  const bR = (a, pA, b, pB) => { const sa = a ? rS(a, pA) : null, sb = b ? rS(b, pB) : null; return sa !== null && sb !== null ? Math.max(sa, sb) : sa ?? sb ?? 50; };
  let deriveScore = 50;
  if (coteVal > 1 && coteRef > 1) deriveScore = 50 + (coteRef - coteVal) / coteRef * 100 * 2;
  const gm = (a, b) => Math.max(a?.GainMoyen || 0, b?.GainMoyen || 0);
  return {
    'Cote (1/cote)': coteVal > 1 ? (1 / coteVal) * 100 : 50, 'Cote ref': coteRef > 1 ? (1 / coteRef) * 100 : 50,
    'Dérive cote': deriveScore, 'Valeur FG': valeur > 0 ? valeur : 50, 'Musique': parseMusique(p.musique),
    'Gains (log)': gains > 0 ? Math.log10(gains) * 10 : 0,
    'TauxV indiv': nbC >= 2 ? nbV / nbC * 100 : 8, 'TauxP indiv': nbC >= 2 ? nbP / nbC * 100 : 30, 'NbVictoires': nbV * 5,
    'Ch TauxV': mxF(ch25, ch26, 'TauxVictoire') || 8, 'Ch TauxP': mxF(ch25, ch26, 'TauxPlace') || 30,
    'Ch Rang': bR(ch25, S.chx25.pop, ch26, S.chx26.pop),
    'Ch GainMoy': gm(ch25, ch26) > 0 ? Math.log10(gm(ch25, ch26)) * 15 : 0, 'Ch ScoreMixte': mxF(ch25, ch26, 'ScoreMixte'),
    'Jk TauxV': mxF(j25, j26, 'TauxVictoire') || 8, 'Jk TauxP': mxF(j25, j26, 'TauxPlace') || 30,
    'Jk Rang': bR(j25, S.jk25.pop, j26, S.jk26.pop), 'Jk ScoreMixte': mxF(j25, j26, 'ScoreMixte'),
    'Jk GainMoy': gm(j25, j26) > 0 ? Math.log10(gm(j25, j26)) * 15 : 0,
    'Cravache Rang': bR(cr25, S.cr25.pop, cr26, S.cr26.pop),
  };
}

// ── courses
const courses = [];
for (const f of fs.readdirSync(path.join(ROOT, 'data/courses')).filter(f => f.endsWith('.json') && f.slice(0, 10) >= '2026-04-16' && hippoFr(f)).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/courses', f), 'utf8'));
  if ((d.type_reunion || '').toLowerCase() !== 'plat') continue;
  const hip = (d.hippodrome || '').toUpperCase();
  if (!TOUS_HIPPOS && !PREMIUM.has(hip)) continue;
  const S = snapPour(f.slice(0, 10)); if (!S) continue;
  for (const c of d.courses || []) {
    if ((c.type || 'Plat').toUpperCase() !== 'PLAT') continue;
    const ps = (c.participants || []).filter(p => num(p.cote) > 1);
    if (ps.length < 3 || !ps.some(p => num(p.arrivee) === 1)) continue;
    const inv = ps.reduce((s, p) => s + 1 / num(p.cote), 0);
    if (inv < 1.05 || inv > 1.6) continue;
    const L = ps.map(p => leviers(p, S));
    const parCote = [...ps].sort((a, b) => num(a.cote) - num(b.cote));
    courses.push({ date: f.slice(0, 10), dist: num(c.distance), L, cote: ps.map(p => num(p.cote)), g: ps.map(p => num(p.arrivee) === 1 ? 1 : 0),
      f1: num(parCote[0].arrivee) === 1 ? 1 : 0, f2: parCote.slice(0, 2).some(p => num(p.arrivee) === 1) ? 1 : 0, f3: parCote.slice(0, 3).some(p => num(p.arrivee) === 1) ? 1 : 0 });
  }
}
const NOMS = Object.keys(courses[0].L[0]);
for (const c of courses) c.Mx = c.L.map(l => NOMS.map(n => l[n] || 0));
console.log(`${courses.length} courses ${TOUS_HIPPOS ? 'FR' : 'premium'} depuis le 16/04/2026, ${NOMS.length} leviers (sans Forme récente ni Combo)\n`);

// ── évaluation d'une formule : identique à evalCombo
function evalCombo(cs, idxs, w) {
  let n1 = 0, n2 = 0, n3 = 0, f1 = 0, f2 = 0, f3 = 0;
  for (const c of cs) {
    const N = c.Mx.length, sc = new Float64Array(N);
    for (let i = 0; i < N; i++) { let s = 0; for (let k = 0; k < idxs.length; k++) s += c.Mx[i][idxs[k]] * w[k]; sc[i] = s; }
    let rangMin = N;
    for (let wi = 0; wi < N; wi++) {
      if (!c.g[wi]) continue;
      let rang = 0;
      for (let j = 0; j < N; j++) { if (j === wi) continue; const d = sc[j] - sc[wi]; if (d > 0.001 || (Math.abs(d) <= 0.001 && c.cote[j] < c.cote[wi])) rang++; }
      if (rang < rangMin) rangMin = rang;
    }
    if (rangMin === 0) n1++; if (rangMin <= 1) n2++; if (rangMin <= 2) n3++;
    f1 += c.f1; f2 += c.f2; f3 += c.f3;
  }
  const t = cs.length || 1;
  return { pN1: n1 / t * 100, pN2: n2 / t * 100, pN3: n3 / t * 100, pF1: f1 / t * 100, pF2: f2 / t * 100, pF3: f3 / t * 100, t: cs.length };
}
function combosOfSize(items, size) {
  if (size === 1) return items.map(x => [x]);
  const res = [];
  for (let i = 0; i <= items.length - size; i++) for (const tail of combosOfSize(items.slice(i + 1), size - 1)) res.push([items[i], ...tail]);
  return res;
}
function weightSets(n, step = 0.1) {
  const total = Math.round(1 / step), out = [];
  (function rec(rem, d, cur) {
    if (d === n - 1) { if (rem >= 1) out.push([...cur, rem * step]); return; }
    for (let v = 1; v <= rem - (n - 1 - d); v++) { cur.push(v * step); rec(rem - v, d + 1, cur); cur.pop(); }
  })(total, 0, []);
  return out;
}
const CORE = ['Cote (1/cote)', 'Cote ref', 'Valeur FG', 'Jk Rang', 'Ch Rang', 'Musique'];
const poolSizeBy = { 2: 12, 3: 10, 4: 8, 5: 7, 6: 7 };
// le champion de la grille sur un jeu de courses, exactement comme stats.html
function champion(cs) {
  const solo = NOMS.map((n, i) => ({ leviers: [n], idxs: [i], w: [1], n: 1, ...evalCombo(cs, [i], [1]) }));
  const cmp = (a, b) => b.pN3 !== a.pN3 ? b.pN3 - a.pN3 : b.pN2 !== a.pN2 ? b.pN2 - a.pN2 : b.pN1 !== a.pN1 ? b.pN1 - a.pN1 : a.n - b.n;
  solo.sort(cmp);
  const pool = [...new Set([...solo.slice(0, 12).map(r => r.leviers[0]), ...CORE])];
  let all = [...solo], tested = solo.length;
  for (let sz = 2; sz <= Math.min(6, pool.length); sz++) {
    const psz = Math.min(poolSizeBy[sz] || 8, pool.length);
    const ws = weightSets(sz);
    for (const levs of combosOfSize(pool.slice(0, psz), sz)) {
      const idxs = levs.map(l => NOMS.indexOf(l));
      for (const w of ws) { all.push({ leviers: levs, idxs, w, n: sz, ...evalCombo(cs, idxs, w) }); tested++; }
    }
  }
  all.sort(cmp);
  return { ...all[0], tested };
}
const BUCKETS = [['tous', 0, 99999], ['sprint', 0, 1399], ['mile', 1400, 1699], ['1600m', 1600, 1699], ['middle', 1700, 2199], ['2000m', 1900, 2099], ['staying', 2200, 99999], ['2400m', 2200, 2500]];
const dans = (c, [k, lo, hi]) => k === 'tous' || (c.dist >= lo && c.dist <= hi);
const fmt = (x, d = 1) => x.toFixed(d).padStart(5);
const IDX_COTE = NOMS.indexOf('Cote (1/cote)');

// ── 1. ce que stats.html montre : champion choisi ET mesuré sur tout
console.log('══ 1. Comme stats.html : la formule choisie sur toutes les courses, mesurée sur les mêmes');
console.log('   bucket     courses  formules   champion                                            Top1  Top2  Top3 | cote seule Top1 Top2 Top3');
for (const b of BUCKETS) {
  const cs = courses.filter(c => dans(c, b)); if (cs.length < 100) continue;
  const ch = champion(cs); const ref = evalCombo(cs, [IDX_COTE], [1]);
  const lab = ch.leviers.map((l, i) => `${l}×${(ch.w[i] * 100).toFixed(0)}`).join(' + ');
  console.log(`   ${b[0].padEnd(10)} ${String(cs.length).padStart(7)} ${String(ch.tested).padStart(9)}   ${lab.slice(0, 50).padEnd(50)} ${fmt(ch.pN1)} ${fmt(ch.pN2)} ${fmt(ch.pN3)} | ${fmt(ref.pN1)} ${fmt(ref.pN2)} ${fmt(ref.pN3)}`);
}

// ── 2. walk-forward : choisi sur le passé, mesuré sur le mois suivant
console.log('\n══ 2. Walk-forward : champion choisi sur les courses AVANT le mois, mesuré sur le mois');
const MOIS = ['2026-06', '2026-07', '2026-08', '2026-09'];
const bilan = {};
for (const b of BUCKETS) {
  const agg = { champ: [0, 0, 0], cote: [0, 0, 0], t: 0, details: [] };
  for (const m of MOIS) {
    const train = courses.filter(c => dans(c, b) && c.date < m + '-01');
    const test = courses.filter(c => dans(c, b) && c.date.startsWith(m));
    if (train.length < 100 || test.length < 15) continue;
    const ch = champion(train);
    const r = evalCombo(test, ch.idxs, ch.w), ref = evalCombo(test, [IDX_COTE], [1]);
    agg.champ[0] += r.pN1 * test.length / 100; agg.champ[1] += r.pN2 * test.length / 100; agg.champ[2] += r.pN3 * test.length / 100;
    agg.cote[0] += ref.pN1 * test.length / 100; agg.cote[1] += ref.pN2 * test.length / 100; agg.cote[2] += ref.pN3 * test.length / 100;
    agg.t += test.length;
    agg.details.push(`${m}: ${ch.leviers.map((l, i) => `${l.replace(' (1/cote)', '')}×${(ch.w[i] * 100).toFixed(0)}`).join('+')} → Top3 ${r.pN3.toFixed(0)} vs cote ${ref.pN3.toFixed(0)} (n=${test.length})`);
  }
  if (!agg.t) continue;
  bilan[b[0]] = agg;
}
console.log('   bucket     courses test   champion Top1  Top2  Top3 | cote seule Top1  Top2  Top3 | écart Top3 ± e-t');
for (const [k, a] of Object.entries(bilan)) {
  const p = a.champ.map(x => 100 * x / a.t), q = a.cote.map(x => 100 * x / a.t);
  const se = Math.sqrt((p[2] / 100 * (1 - p[2] / 100) + q[2] / 100 * (1 - q[2] / 100)) / a.t) * 100 * 0.8;   // corrélés : borne prudente
  console.log(`   ${k.padEnd(10)} ${String(a.t).padStart(12)}   ${fmt(p[0])} ${fmt(p[1])} ${fmt(p[2])}          | ${fmt(q[0])} ${fmt(q[1])} ${fmt(q[2])}          | ${(p[2] - q[2] >= 0 ? '+' : '') + (p[2] - q[2]).toFixed(1)} ± ${se.toFixed(1)}`);
}
console.log('\n   détail par mois :');
for (const [k, a] of Object.entries(bilan)) for (const d of a.details) console.log(`   ${k.padEnd(10)} ${d}`);
