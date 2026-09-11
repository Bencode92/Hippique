/* « Tu compares avec 2024-2025 sans avoir toutes les infos » — juste.
 *
 * data/histo remonte a 2022 mais ne contient ni la Valeur FG, ni l'equipement,
 * ni la tendance de cote. data/courses les a, et commence au 01/04/2026.
 * Cette mesure-ci n'utilise QUE data/courses : toutes les infos, aucun levier
 * absent.
 *
 * PROTOCOLE, ecrit avant de regarder :
 *   univers  : plat FR, 5 partants et plus, courses courues
 *   train    : avril → juin 2026        test : juillet → septembre 2026
 *   grille   : la cote + jusqu'a 2 autres leviers parmi 16, pas de 0,1
 *   criteres : Top1, Top2 et Top3, compares au classement par la cote
 *   verdict  : capte si l'ecart sur le TEST depasse son erreur-type
 *
 *     node bench/formule_donnees_riches.mjs [K]
 */
import fs from 'fs';
const COUPE = '2026-07-01';
const K = parseInt(process.argv[2]) || 1;

const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.\-]/g, '')); return isFinite(x) ? x : null; };
const posMus = m => { const v = String(m || '').match(/\d+/g); return v ? v.map(Number).filter(x => x > 0 && x < 25) : null; };
const moy = a => a.reduce((s, x) => s + x, 0) / a.length;

const jk = new Map(), combo = new Map();
const tJk = (n, c) => { const s = jk.get(n); return s && s.c >= 10 ? s[c] / s.c : (c === 'v' ? 0.09 : 0.30); };
const tCo = (j, e) => { const s = combo.get(j + '|' + e); return s && s.c >= 5 ? s.v / s.c : 0.09; };

const NOMS = ['1/cote', 'cote ref', 'dérive', 'tendance', 'VALEUR FG', 'musique', 'forme récente',
              'poids', 'corde', 'gain moyen', 'nb victoires', 'tauxV cheval', 'tauxP cheval',
              'tauxV jockey', 'combo jk-ent', 'ÉQUIPEMENT'];
const lev = p => {
  const c = num(p.cote) || 99, cr = num(p.cote_reference);
  const nc = num(p.nb_courses) || 0, nv = num(p.nb_victoires) || 0, np = num(p.nb_places) || 0;
  const mus = posMus(p.musique);
  const t = String(p.cote_tendance || '');
  return [
    1 / c,
    cr > 1 ? 1 / cr : 1 / c,
    cr > 1 ? (cr - c) / cr : 0,
    t.includes('-') ? 1 : t.includes('+') ? -1 : 0,
    num(p.valeur) || 0,
    mus ? -moy(mus) : -8,
    mus ? -moy(mus.slice(0, 3)) : -8,
    num(p.poids) || 55,
    -(num(p.corde) || 8),
    nc >= 1 ? (num(p.gains) || 0) / nc : 0,
    nv,
    nc >= 2 ? nv / nc : 0.09,
    nc >= 2 ? np / nc : 0.30,
    tJk(p.jockey, 'v'),
    tCo(p.jockey, p.entraineur),
    String(p['equipement(s)'] || '').trim() ? 1 : 0,
  ];
};

const NL = NOMS.length, courses = [];
for (const f of fs.readdirSync('data/courses').filter(x => /^2026-\d\d-\d\d_/.test(x)).sort()) {
  const d = JSON.parse(fs.readFileSync('data/courses/' + f, 'utf8'));
  if ((d.type_reunion || '').toLowerCase() !== 'plat') continue;
  const date = f.slice(0, 10);
  for (const c of d.courses || []) {
    const ps = (c.participants || []).filter(p => (num(p.cote) || 0) > 1);
    const gi = ps.findIndex(p => parseInt(p.arrivee) === 1);
    if (ps.length >= 5 && gi >= 0) {
      const M = new Float64Array(ps.length * NL);
      ps.forEach((p, i) => { const v = lev(p); for (let k = 0; k < NL; k++) M[i * NL + k] = v[k]; });
      for (let k = 0; k < NL; k++) {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < ps.length; i++) { const x = M[i * NL + k]; if (x < lo) lo = x; if (x > hi) hi = x; }
        const r = hi - lo || 1;
        for (let i = 0; i < ps.length; i++) M[i * NL + k] = (M[i * NL + k] - lo) / r;
      }
      const parCote = ps.map((_, i) => i).sort((a, b) => num(ps[a].cote) - num(ps[b].cote));
      const cotes = Float64Array.from(ps.map(p => num(p.cote) || 99));
      courses.push({ date, N: ps.length, M, cotes, gagnant: gi, rangMarche: parCote.indexOf(gi) });
    }
    for (const p of c.participants || []) {
      const s = jk.get(p.jockey) || { c: 0, v: 0, p: 0 };
      s.c++; const a = parseInt(p.arrivee);
      if (a === 1) s.v++; if (a >= 1 && a <= 3) s.p++; jk.set(p.jockey, s);
      const k2 = p.jockey + '|' + p.entraineur, t2 = combo.get(k2) || { c: 0, v: 0 };
      t2.c++; if (a === 1) t2.v++; combo.set(k2, t2);
    }
  }
}

// Les EX AEQUO doivent etre departages, sinon un levier peu renseigne triche :
// l'equipement n'est present que sur 10 % des partants, donc dans la plupart
// des courses tout le monde vaut 0 — et compter « personne n'est strictement
// mieux que le gagnant » le creditait de 56 % de Top1, soit 24 points de plus
// que la cote. Un classement reel departage ; on le fait par la cote, comme le
// ferait le front sur un tri stable.
const topK = (set, l, w) => {
  let ok = 0;
  for (const c of set) {
    const sc = new Float64Array(c.N);
    for (let i = 0; i < c.N; i++) { let s = 0; for (let j = 0; j < l.length; j++) s += w[j] * c.M[i * NL + l[j]]; sc[i] = s; }
    const g = c.gagnant;
    let mieux = 0;
    for (let i = 0; i < c.N; i++) {
      if (i === g) continue;
      if (sc[i] > sc[g] || (sc[i] === sc[g] && c.cotes[i] < c.cotes[g])) mieux++;
    }
    if (mieux < K) ok++;
  }
  return ok / set.length;
};

const tr = courses.filter(c => c.date < COUPE), te = courses.filter(c => c.date >= COUPE);
console.log(`${courses.length} courses courues, toutes infos présentes (data/courses uniquement)`);
console.log(`train ${tr.length} (avril–juin) · test ${te.length} (juillet–septembre) · critère : gagnant dans les ${K} premier${K > 1 ? 's' : ''}\n`);

const PAS2 = [[.9,.1],[.8,.2],[.7,.3],[.6,.4],[.5,.5],[.4,.6],[.3,.7]];
const PAS3 = [[.6,.2,.2],[.5,.3,.2],[.5,.2,.3],[.4,.3,.3],[.7,.2,.1],[.7,.1,.2],[.4,.4,.2],[.3,.4,.3]];
let best = null;
for (const base of [0, 1])
  for (let a = -1; a < NL; a++) for (let b = a; b < NL; b++) {
    if (a === base || b === base) continue;
    const l = [base].concat(a >= 0 ? [a] : []).concat(b > a && b >= 0 ? [b] : []);
    if (l.length !== new Set(l).size) continue;
    for (const w of (l.length === 1 ? [[1]] : l.length === 2 ? PAS2 : PAS3)) {
      const t = topK(tr, l, w);
      if (!best || t > best.t) best = { l, w, t };
    }
  }
const tt = topK(te, best.l, best.w);
const mc = te.filter(c => c.rangMarche < K).length / te.length;
const se = Math.sqrt(tt * (1 - tt) / te.length) * 100;
const d = 100 * (tt - mc);
console.log('  champion trouvé sur le train : ' + best.l.map((x, i) => `${NOMS[x]}×${best.w[i]}`).join(' + '));
console.log(`  sur le TRAIN  ${(100 * best.t).toFixed(1)} %`);
console.log(`  sur le TEST   ${(100 * tt).toFixed(1)} %   contre ${(100 * mc).toFixed(1)} % pour la cote seule`);
console.log(`  écart         ${d >= 0 ? '+' : ''}${d.toFixed(1)} ± ${se.toFixed(1)} pt   ${Math.abs(d) > se ? (d > 0 ? '← CAPTE' : '← pire, hors bruit') : '← dans le bruit'}`);
console.log(`  perte train → test : ${(100 * (best.t - tt)).toFixed(1)} pt`);

// Ce que vaut chaque levier SEUL sur le test : si l'un d'eux portait une
// information que la cote n'a pas, il se verrait ici.
console.log('\n  CHAQUE LEVIER SEUL, sur le test');
const solo = NOMS.map((n, i) => ({ n, v: topK(te, [i], [1]) })).sort((a, b) => b.v - a.v);
for (const x of solo) {
  const ec = 100 * (x.v - mc);
  console.log(`    ${x.n.padEnd(16)}${(100 * x.v).toFixed(1).padStart(6)} %   ${(ec >= 0 ? '+' : '') + ec.toFixed(1)} pt vs la cote`);
}
// et la cote associee a chaque levier, pour voir si l'un d'eux AJOUTE
console.log('\n  1/COTE + UN LEVIER, meilleur poids choisi sur le train, mesure sur le test');
const duos = [];
for (let i = 1; i < NL; i++) {
  let meil = null;
  for (const w of PAS2) { const t = topK(tr, [0, i], w); if (!meil || t > meil.t) meil = { w, t }; }
  duos.push({ n: NOMS[i], w: meil.w[1], test: topK(te, [0, i], meil.w) });
}
duos.sort((a, b) => b.test - a.test);
for (const d2 of duos.slice(0, 6)) {
  const ec = 100 * (d2.test - mc);
  console.log(`    1/cote + ${d2.n.padEnd(14)}×${d2.w}  ${(100 * d2.test).toFixed(1)} %   ${(ec >= 0 ? '+' : '') + ec.toFixed(1)} pt`);
}
