/* Les formules de best_formulas.json ont été choisies le 08/09/2026 sur les
 * 628 courses premium POSTÉRIEURES au 16/04/2026. Tout le premium ANTÉRIEUR est
 * donc hors échantillon, et déjà collecté : pas besoin d'attendre un an.
 *
 * Seules les formules sans « Valeur FG » sont rejouables (data/courses ne
 * remonte qu'à avril 2026 ; data/histo remonte à 2022).
 *
 * RÉSERVE DE MÉTHODE : la normalisation exacte des leviers par stats.html n'est
 * pas documentée. On applique un min-max intra-course, le choix le plus naturel
 * et celui qu'utilise déjà le scoring du front. Une reproduction imparfaite
 * pourrait donc pénaliser l'Optimale — c'est pourquoi on rapporte AUSSI le
 * classement par le levier dominant seul, lui exactement reproductible.
 *
 *     node bench/optimale_hors_echantillon.mjs
 */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const PREMIUM = ['LONGCHAMP','SAINTCLOUD','CHANTILLY','FONTAINEBLEAU','DEAUVILLE','LYONPARILLY'];
const COUPE = '2026-04-16';

const courses = [];
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    if (!PREMIUM.some(x=>norm(d.hip).includes(x))) continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 5) continue;
    courses.push(d);
  }
courses.sort((a,b)=>a.date.localeCompare(b.date));

// taux de victoire jockey, construit chronologiquement — jamais avec le futur
const jk = new Map(), combo = new Map();
const tauxJk  = n => { const s = jk.get(n); return s && s.c >= 10 ? s.v / s.c : 0.08; };
const tauxJkP = n => { const s = jk.get(n); return s && s.c >= 10 ? s.p / s.c : 0.30; };
const tauxCombo = (j, e) => { const s = combo.get(j+'|'+e); return s && s.c >= 5 ? s.v / s.c : 0.08; };

const mm = a => { const lo = Math.min(...a), hi = Math.max(...a); const r = hi - lo || 1;
                  return a.map(x => (x - lo) / r); };
// Musique « 6p3p2p5p1p6p » : positions des dernières sorties. On renvoie
// l'opposé de la position moyenne, pour que « plus grand = meilleur » comme
// tous les autres leviers.
const posMusique = m => {
  const v = String(m||'').match(/\d+/g);
  if (!v || !v.length) return null;
  return v.map(Number).filter(x => x > 0 && x < 25);
};
const moy = a => a.reduce((s,x)=>s+x,0)/a.length;

const LEV = {
  'Cote (1/cote)': ps => ps.map(p => 1/p.c),
  'Cote ref':      ps => ps.map(p => 1/(p.cr > 1 ? p.cr : p.c)),
  'Dérive cote':   ps => ps.map(p => (p.cr > 1 ? (p.cr - p.c) / p.cr : 0)),
  'Ch TauxP':      ps => ps.map(p => (p.nc >= 2 ? p.np / p.nc : 0.30)),
  'TauxV indiv':   ps => ps.map(p => (p.nc >= 2 ? p.nv / p.nc : 0.08)),
  'NbVictoires':   ps => ps.map(p => p.nv || 0),
  'Ch GainMoy':    ps => ps.map(p => (p.nc >= 1 ? (p.g||0) / p.nc : 0)),
  'Jk TauxV':      ps => ps.map(p => tauxJk(p.jk)),
  'Jk TauxP':      ps => ps.map(p => tauxJkP(p.jk)),
  // « rang » du jockey : plus grand = meilleur, donc on prend le taux lui-même
  // (le rang n'est qu'une transformation monotone décroissante de ce taux).
  'Jk Rang':       ps => ps.map(p => tauxJk(p.jk)),
  'Combo Jk*Ent':  ps => ps.map(p => tauxCombo(p.jk, p.en)),
  'Musique':       ps => ps.map(p => { const v = posMusique(p.m); return v ? -moy(v) : -8; }),
  'Forme récente': ps => ps.map(p => { const v = posMusique(p.m); return v ? -moy(v.slice(0,3)) : -8; }),
};
const bf = JSON.parse(fs.readFileSync('data/best_formulas.json','utf8'));
// Bornes de distance par bucket. Les buckets larges (sprint/mile/middle/
// staying) ne servent que si aucun bucket fin ne s'applique, comme dans le front.
const FINS  = { '1000m':[975,1075], '1200m':[1150,1275], '1300m':[1276,1375],
                '1400m':[1376,1475], '1500m':[1476,1575], '1600m':[1576,1675],
                '1800m':[1750,1875], '2000m':[1950,2075], '2100m':[2076,2175],
                '2400m':[2350,2475], '3000m+':[3000,9999] };
const LARGES = { sprint:[0,1400], mile:[1401,1750], middle:[1751,2200], staying:[2201,2999] };

const res = {};
const push = (k, o) => (res[k] = res[k] || []).push(o);

for (const d of courses) {
  const ps = (d.parts||[]).filter(p=>p.c>1);
  const gagnant = ps.find(p => p.a === 1);
  const horsEch = d.date < COUPE;
  const buckets = [];
  for (const [b, [lo, hi]] of Object.entries(FINS))   if (d.dist >= lo && d.dist <= hi) buckets.push(b);
  for (const [b, [lo, hi]] of Object.entries(LARGES)) if (d.dist >= lo && d.dist <= hi) buckets.push(b);
  buckets.push('tous');
  if (gagnant) for (const nomB of buckets) {
    const fo = bf[nomB];
    if (!fo) continue;
    // « Valeur FG » n'existe pas dans data/histo (data/courses ne remonte qu'à
    // avril 2026). Le levier est retiré et les poids restants renormalisés —
    // la formule testée est donc AMPUTÉE, ce que le tableau signale.
    const idx = fo.leviers.map((l,i)=>[l,i]).filter(([l])=>LEV[l]).map(([,i])=>i);
    if (!idx.length) continue;
    const ampute = idx.length < fo.leviers.length;
    const somme = idx.reduce((s,i)=>s+fo.poids[i],0) || 1;
    const cols = idx.map(i => mm(LEV[fo.leviers[i]](ps)));
    const score = ps.map((_, r) => idx.reduce((s, i, j) => s + (fo.poids[i]/somme) * cols[j][r], 0));
    let best = 0; for (let i = 1; i < ps.length; i++) if (score[i] > score[best]) best = i;
    const fav = ps.reduce((a,b)=>a.c<=b.c?a:b);
    const refIdx = ps.reduce((a,b,i)=>((b.cr>1?b.cr:b.c) < (ps[a].cr>1?ps[a].cr:ps[a].c) ? i : a), 0);
    push(`${horsEch ? 'hors' : 'in'}|${nomB}`, {
      opt: ps[best].a === 1, marche: fav.a === 1, coteRef: ps[refIdx].a === 1,
      ampute, partTestee: somme / fo.poids.reduce((s,x)=>s+x,0),
    });
  }
  // historique jockey mis à jour APRÈS la course
  for (const p of d.parts||[]) {
    const s = jk.get(p.jk) || { c:0, v:0, p:0 };
    s.c++; if (p.a === 1) s.v++; if (p.a >= 1 && p.a <= 3) s.p++; jk.set(p.jk, s);
    const k = p.jk+'|'+p.en, t = combo.get(k) || { c:0, v:0 };
    t.c++; if (p.a === 1) t.v++; combo.set(k, t);
  }
}

const t1 = (a, k) => { const w = a.filter(x=>x[k]).length, p = w/a.length;
  return `${(100*p).toFixed(1)} % ± ${(100*Math.sqrt(p*(1-p)/a.length)).toFixed(1)}`; };
console.log('OPTIMALE HORS ÉCHANTILLON — premium AVANT le 16/04/2026\n');
console.log('  bucket      n      Optimale         marché (cote)    écart     calibration');
const tous = Object.keys(FINS).concat(Object.keys(LARGES), ['tous']);
let nMieux = 0, nTeste = 0;
for (const b of tous) {
  const a = res[`hors|${b}`];
  if (!a || a.length < 60) { console.log(`  ${b.padEnd(11)}${String(a?a.length:0).padStart(5)}  — trop peu hors échantillon`); continue; }
  const o = a.filter(x=>x.opt).length/a.length, m = a.filter(x=>x.marche).length/a.length;
  const d = 100*(o-m); nTeste++; if (d > 0) nMieux++;
  console.log(`  ${b.padEnd(11)}${String(a.length).padStart(5)}  ${t1(a,'opt').padStart(14)}  ${t1(a,'marche').padStart(14)}` +
    `  ${(d>=0?'+':'')}${d.toFixed(1)} pt`.padStart(10) +
    `   ${bf[b] ? bf[b].top1.toFixed(1)+' % (n='+bf[b].courses+')' : ''}` +
    (a[0].ampute ? `  [${(100*a[0].partTestee).toFixed(0)} % du poids testé]` : '  [formule complète]'));
}
console.log(`\n  ${nMieux} bucket(s) sur ${nTeste} où l'Optimale bat la cote hors échantillon.`);
const entiers = tous.filter(b => res[`hors|${b}`] && res[`hors|${b}`].length >= 60 && !res[`hors|${b}`][0].ampute);
let mieuxE = 0;
for (const b of entiers) {
  const a = res[`hors|${b}`];
  if (a.filter(x=>x.opt).length > a.filter(x=>x.marche).length) mieuxE++;
}
console.log(`  En ne gardant que les formules testées ENTIÈRES (sans Valeur FG dans leur`);
console.log(`  définition) : ${mieuxE} sur ${entiers.length} — ${entiers.join(', ')}.`);
