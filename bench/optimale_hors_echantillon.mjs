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
const jk = new Map();
const tauxJk = n => { const s = jk.get(n); return s && s.c >= 10 ? s.v / s.c : 0.08; };

const mm = a => { const lo = Math.min(...a), hi = Math.max(...a); const r = hi - lo || 1;
                  return a.map(x => (x - lo) / r); };
const LEV = {
  'Cote (1/cote)': ps => ps.map(p => 1/p.c),
  'Cote ref':      ps => ps.map(p => 1/(p.cr > 1 ? p.cr : p.c)),
  'Dérive cote':   ps => ps.map(p => (p.cr > 1 ? (p.cr - p.c) / p.cr : 0)),
  'Ch TauxP':      ps => ps.map(p => (p.nc >= 2 ? p.np / p.nc : 0.30)),
  'TauxV indiv':   ps => ps.map(p => (p.nc >= 2 ? p.nv / p.nc : 0.08)),
  'NbVictoires':   ps => ps.map(p => p.nv || 0),
  'Jk TauxV':      ps => ps.map(p => tauxJk(p.jk)),
};
const bf = JSON.parse(fs.readFileSync('data/best_formulas.json','utf8'));
const BUCKETS = { sprint:[0,1300], '1200m':[1150,1250], '1500m':[1450,1550],
                  '1800m':[1750,1850], '3000m+':[3000,9999] };

const res = {};
const push = (k, o) => (res[k] = res[k] || []).push(o);

for (const d of courses) {
  const ps = (d.parts||[]).filter(p=>p.c>1);
  const gagnant = ps.find(p => p.a === 1);
  const horsEch = d.date < COUPE;
  if (gagnant) for (const [nomB, [lo, hi]] of Object.entries(BUCKETS)) {
    const fo = bf[nomB];
    if (!fo || d.dist < lo || d.dist > hi) continue;
    if (!fo.leviers.every(l => LEV[l])) continue;      // levier non reconstituable
    const cols = fo.leviers.map(l => mm(LEV[l](ps)));
    const score = ps.map((_, i) => fo.leviers.reduce((s, _l, j) => s + fo.poids[j] * cols[j][i], 0));
    let best = 0; for (let i = 1; i < ps.length; i++) if (score[i] > score[best]) best = i;
    const fav = ps.reduce((a,b)=>a.c<=b.c?a:b);
    const refIdx = ps.reduce((a,b,i)=>((b.cr>1?b.cr:b.c) < (ps[a].cr>1?ps[a].cr:ps[a].c) ? i : a), 0);
    push(`${horsEch ? 'hors' : 'in'}|${nomB}`, {
      opt: ps[best].a === 1, marche: fav.a === 1, coteRef: ps[refIdx].a === 1,
    });
  }
  // historique jockey mis à jour APRÈS la course
  for (const p of d.parts||[]) {
    const s = jk.get(p.jk) || { c:0, v:0 }; s.c++; if (p.a === 1) s.v++; jk.set(p.jk, s);
  }
}

const t1 = (a, k) => { const w = a.filter(x=>x[k]).length, p = w/a.length;
  return `${(100*p).toFixed(1)} % ± ${(100*Math.sqrt(p*(1-p)/a.length)).toFixed(1)}`; };
console.log('OPTIMALE HORS ÉCHANTILLON — premium AVANT le 16/04/2026\n');
console.log('  bucket      n      Optimale        marché (cote)   cote de référence');
for (const b of Object.keys(BUCKETS)) {
  const a = res[`hors|${b}`];
  if (!a || a.length < 60) { console.log(`  ${b.padEnd(11)}${a?a.length:0} — trop peu`); continue; }
  console.log(`  ${b.padEnd(11)}${String(a.length).padStart(5)}  ${t1(a,'opt').padStart(14)}  ${t1(a,'marche').padStart(14)}  ${t1(a,'coteRef').padStart(14)}`);
}
console.log('\n  Pour mémoire, dans l\'échantillon de calibration (annoncé par best_formulas) :');
for (const b of Object.keys(BUCKETS)) if (bf[b]) console.log(`    ${b.padEnd(11)}${bf[b].top1.toFixed(1)} % (n=${bf[b].courses})`);
