#!/usr/bin/env node
/**
 * Bench de l'analyse de leviers (stats.html → evalCombo).
 *
 *   node bench/bench-leviers.mjs [bucket] [nbCourses]
 *
 * Compare l'implémentation actuelle à une version optimisée, sur la MÊME
 * grille (2L→6L, poids par pas de 0.1) et les MÊMES données, et vérifie que
 * les deux rendent exactement les mêmes compteurs.
 */
import fs from 'node:fs'; import path from 'node:path';
const R = path.dirname(new URL(import.meta.url).pathname) + '/..';
const LEVIERS = ['Cote (1/cote)','Cote ref','Dérive cote','Valeur FG','Musique','Gains (log)',
  'TauxV indiv','TauxP indiv','NbVictoires','Ch TauxV','Ch TauxP','Ch Rang','Ch GainMoy',
  'Ch ScoreMixte','Jk TauxV','Jk TauxP','Jk Rang','Jk ScoreMixte','Jk GainMoy','Cravache Rang',
  'Forme récente','Combo Jk*Ent'];

// ── données réelles : courses plat terminées avec cotes ────────────────
const NB = parseInt(process.argv[3] || '250');
const courses = [];
for (const f of fs.readdirSync(R + '/data/courses').filter(f => f.endsWith('.json')).sort().reverse()) {
  if (courses.length >= NB) break;
  let d; try { d = JSON.parse(fs.readFileSync(R + '/data/courses/' + f, 'utf8')); } catch { continue; }
  if (d.type_reunion && d.type_reunion.toLowerCase() !== 'plat') continue;
  for (const c of d.courses || []) {
    if (courses.length >= NB) break;
    if (!c.arrivee_definitive || !c.participants?.some(p => p.arrivee === 1)) continue;
    const parts = c.participants.filter(p => p.cote > 1);
    if (parts.length < 2) continue;
    // Valeurs de leviers déterministes : les vraies là où la course les porte,
    // dérivées du nom sinon. Ce qui compte ici est que les DEUX versions
    // reçoivent exactement les mêmes nombres.
    parts.forEach((p, i) => {
      const h = [...String(p.cheval || i)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 9973, 7);
      p._lev = {};
      LEVIERS.forEach((L, k) => {
        p._lev[L] = L === 'Cote (1/cote)' ? (1 / p.cote) * 100
                  : L === 'Cote ref' ? (p.cote_reference > 1 ? (1 / p.cote_reference) * 100 : 50)
                  : L === 'Valeur FG' ? (parseFloat(p.valeur) || 50)
                  : ((h * (k + 3)) % 1000) / 10;
      });
    });
    courses.push({ parts, parCote: [...parts].sort((a, b) => a.cote - b.cote) });
  }
}

// ── version ACTUELLE (copiée de stats.html) ────────────────────────────
function evalCombo(courses, names, weights) {
  let n1=0,f1=0,f2=0,f3=0,n2=0,n3=0,coteSum=0,wins=0;
  courses.forEach(c => {
    const sorted = [...c.parts].sort((a,b) => {
      let sa=0, sb=0;
      names.forEach((n,i) => { sa += (a._lev[n]||0)*weights[i]; sb += (b._lev[n]||0)*weights[i]; });
      const diff = sb - sa;
      if (Math.abs(diff) > 0.001) return diff;
      return (parseFloat(a.cote)||999) - (parseFloat(b.cote)||999);
    });
    if (sorted[0]?.arrivee===1) { n1++; if (sorted[0].cote>1) { coteSum+=sorted[0].cote; wins++; } }
    if (c.parCote[0]?.arrivee===1) f1++;
    if (c.parCote.slice(0,2).some(p=>p.arrivee===1)) f2++;
    if (c.parCote.slice(0,3).some(p=>p.arrivee===1)) f3++;
    if (sorted.slice(0,2).some(p=>p.arrivee===1)) n2++;
    if (sorted.slice(0,3).some(p=>p.arrivee===1)) n3++;
  });
  const t = courses.length;
  return { n1,f1,f2,f3,n2,n3,t, pN3:t?n3/t*100:0, avgCote:wins>0?coteSum/wins:0 };
}

// ── version OPTIMISÉE ──────────────────────────────────────────────────
const IDX = new Map(LEVIERS.map((L, i) => [L, i]));
function prepare(courses) {
  for (const c of courses) {
    const N = c.parts.length;
    c._M = new Float64Array(N * LEVIERS.length);
    c._cote = new Float64Array(N);
    c._gagnant = new Uint8Array(N);
    c.parts.forEach((p, i) => {
      LEVIERS.forEach((L, k) => { c._M[i * LEVIERS.length + k] = p._lev[L] || 0; });
      c._cote[i] = parseFloat(p.cote) || 999;
      c._gagnant[i] = p.arrivee === 1 ? 1 : 0;
    });
    c._sc = new Float64Array(N);
    c._ord = new Int32Array(N);
    // stats du favori : indépendantes de la formule, calculées UNE fois
    c._f1 = c.parCote[0]?.arrivee === 1 ? 1 : 0;
    c._f2 = c.parCote.slice(0,2).some(p=>p.arrivee===1) ? 1 : 0;
    c._f3 = c.parCote.slice(0,3).some(p=>p.arrivee===1) ? 1 : 0;
  }
}
function evalComboOpt(courses, names, weights) {
  let n1=0,f1=0,f2=0,f3=0,n2=0,n3=0,coteSum=0,wins=0;
  const K = names.length;
  const cols = new Int32Array(K); for (let k=0;k<K;k++) cols[k] = IDX.get(names[k]);
  const L = LEVIERS.length;
  for (let ci=0; ci<courses.length; ci++) {
    const c = courses[ci], N = c.parts.length, M = c._M, sc = c._sc, ord = c._ord, cote = c._cote;
    for (let i=0;i<N;i++) {
      let s = 0, base = i * L;
      for (let k=0;k<K;k++) s += M[base + cols[k]] * weights[k];
      sc[i] = s; ord[i] = i;
    }
    // même ordre que la version actuelle : score DESC, égalité (<0.001) → cote ASC
    const a = Array.prototype.slice.call(ord);
    a.sort((x,y) => { const d = sc[y] - sc[x]; return Math.abs(d) > 0.001 ? d : cote[x] - cote[y]; });
    const g = c._gagnant;
    if (g[a[0]]) { n1++; const cc = cote[a[0]]; if (cc>1) { coteSum+=cc; wins++; } }
    f1 += c._f1; f2 += c._f2; f3 += c._f3;
    if (g[a[0]] || (N>1 && g[a[1]])) n2++;
    if (g[a[0]] || (N>1 && g[a[1]]) || (N>2 && g[a[2]])) n3++;
  }
  const t = courses.length;
  return { n1,f1,f2,f3,n2,n3,t, pN3:t?n3/t*100:0, avgCote:wins>0?coteSum/wins:0 };
}

// ── version RANG : aucun tri, aucune allocation ────────────────────────
// On n'a jamais besoin du classement complet : seulement de savoir si le
// gagnant est 1er, dans les 2 premiers ou dans les 3 premiers. C'est le
// nombre de partants qui passent DEVANT lui, en une seule passe.
function evalComboRang(courses, names, weights) {
  let n1=0,f1=0,f2=0,f3=0,n2=0,n3=0,coteSum=0,wins=0;
  const K = names.length;
  const cols = new Int32Array(K); for (let k=0;k<K;k++) cols[k] = IDX.get(names[k]);
  const L = LEVIERS.length;
  for (let ci=0; ci<courses.length; ci++) {
    const c = courses[ci], N = c.parts.length, M = c._M, sc = c._sc, cote = c._cote, g = c._gagnant;
    for (let i=0;i<N;i++) {
      let s = 0; const base = i * L;
      for (let k=0;k<K;k++) s += M[base + cols[k]] * weights[k];
      sc[i] = s;
    }
    // rang du meilleur gagnant (dead heat : on prend le mieux classé)
    let rangMin = N, coteGagnant = 0;
    for (let w=0; w<N; w++) {
      if (!g[w]) continue;
      let rang = 0;
      const sw = sc[w], cw = cote[w];
      for (let j=0;j<N;j++) {
        if (j === w) continue;
        const d = sc[j] - sw;
        if (d > 0.001 || (Math.abs(d) <= 0.001 && cote[j] < cw)) rang++;
      }
      if (rang < rangMin) { rangMin = rang; coteGagnant = cw; }
    }
    if (rangMin === 0) { n1++; if (coteGagnant > 1) { coteSum += coteGagnant; wins++; } }
    if (rangMin <= 1) n2++;
    if (rangMin <= 2) n3++;
    f1 += c._f1; f2 += c._f2; f3 += c._f3;
  }
  const t = courses.length;
  return { n1,f1,f2,f3,n2,n3,t, pN3:t?n3/t*100:0, avgCote:wins>0?coteSum/wins:0 };
}

// ── grille identique à stats.html ──────────────────────────────────────
function combosOfSize(items, size) {
  if (size === 1) return items.map(x => [x]);
  const res = [];
  for (let i = 0; i <= items.length - size; i++)
    for (const tail of combosOfSize(items.slice(i+1), size-1)) res.push([items[i], ...tail]);
  return res;
}
function weightSets(n, step = 0.1) {
  const total = Math.round(1/step), out = [];
  (function rec(rem, d, cur) {
    if (d === n-1) { if (rem >= 1) out.push([...cur, rem*step]); return; }
    for (let v = 1; v <= rem - (n-1-d); v++) { cur.push(v*step); rec(rem-v, d+1, cur); cur.pop(); }
  })(total, 0, []);
  return out;
}
const pool = LEVIERS.slice(0, 12);
const poolSizeBy = { 2:12, 3:10, 4:8, 5:7, 6:7 };
const taches = [];
for (let sz = 2; sz <= 6; sz++) {
  const levSets = combosOfSize(pool.slice(0, poolSizeBy[sz]), sz);
  const ws = weightSets(sz);
  for (const levs of levSets) for (const w of ws) taches.push([levs, w]);
}

console.log(`\n🔬 BENCH LEVIERS — ${courses.length} courses, ${taches.length} formules (1 bucket)\n`);
prepare(courses);
let t0 = performance.now(); const rA = taches.map(([l,w]) => evalCombo(courses, l, w)); const tA = performance.now()-t0;
t0 = performance.now(); const rB = taches.map(([l,w]) => evalComboOpt(courses, l, w)); const tB = performance.now()-t0;
t0 = performance.now(); const rC = taches.map(([l,w]) => evalComboRang(courses, l, w)); const tC = performance.now()-t0;
let diff = 0;
for (let i=0;i<rA.length;i++) if (JSON.stringify(rA[i]) !== JSON.stringify(rB[i])) { if (diff<3) console.log('  ≠', JSON.stringify(taches[i][0]), JSON.stringify(rA[i]), JSON.stringify(rB[i])); diff++; }
console.log(`  actuelle  : ${Math.round(tA).toLocaleString('fr-FR').padStart(7)} ms`);
console.log(`  matricielle: ${Math.round(tB).toLocaleString('fr-FR').padStart(6)} ms   (×${(tA/tB).toFixed(1)})`);
console.log(`  par rang   : ${Math.round(tC).toLocaleString('fr-FR').padStart(6)} ms   (×${(tA/tC).toFixed(1)})`);
let diffC = 0;
for (let i=0;i<rA.length;i++) if (JSON.stringify(rA[i]) !== JSON.stringify(rC[i])) { if (diffC<3) console.log('  ≠rang', JSON.stringify(taches[i][0]), JSON.stringify(rA[i]), JSON.stringify(rC[i])); diffC++; }
console.log(`  ${diffC === 0 ? '✅ version par rang IDENTIQUE aussi' : '❌ ' + diffC + ' divergences sur la version par rang'}`);
console.log(`  ${diff === 0 ? '✅ résultats IDENTIQUES sur les ' + rA.length + ' formules' : '❌ ' + diff + ' divergences'}`);
console.log(`\n  Extrapolation 16 buckets : ${(tA*16/1000).toFixed(1)} s → ${(tC*16/1000).toFixed(1)} s\n`);
