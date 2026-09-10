/* Dernière hypothèse causale ouverte, pré-spécifiée par l'expert :
 *
 *   Le favori qui s'est DÉJÀ PLACÉ sur l'hippodrome du jour se comporte-t-il
 *   différemment de celui qui y court pour la première fois ? Comparaison
 *   Longchamp / Saint-Cloud contre Chantilly / Deauville.
 *
 *   Prédiction : si l'écart est concentré sur les « déjà placés », l'effet est
 *   transportable ; sinon, on arrête de chercher.
 *
 * Historique construit chronologiquement, jamais avec le futur : pour chaque
 * course, on ne regarde que les arrivées ANTÉRIEURES à sa date. 2022 sert
 * d'amorce et n'est pas mesurée. */
import fs from 'fs';
import { createRequire } from 'module';
const PP = createRequire(import.meta.url)('../js/panneau-paris.js');
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

const courses = [];
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe === 'PLAT') courses.push(d);
  }
courses.sort((a,b)=>a.date.localeCompare(b.date));

const GROUPE = h => {
  const n = norm(h);
  if (n.includes('LONGCHAMP') || n.includes('SAINTCLOUD')) return 'Longchamp / Saint-Cloud';
  if (n.includes('CHANTILLY') || n.includes('DEAUVILLE'))  return 'Chantilly / Deauville';
  return null;
};

const vu = new Map();                     // "cheval|hippodrome" → déjà placé (top 3)
const L = [];
for (const d of courses) {
  const ps = (d.parts||[]).filter(p=>p.c>1);
  const grp = GROUPE(d.hip);
  const hip = norm(d.hip);

  if (ps.length >= 5 && grp && d.date >= '2023-01-01') {
    const tri = ps.slice().sort((a,b)=>a.c-b.c);
    const P = PP.probabilites(tri.map(p=>({cote:p.c})));
    const fav = tri[0];
    L.push({
      date: d.date, groupe: grp,
      dejaPlace: vu.get(`${norm(fav.nom)}|${hip}`) === true,
      gain: fav.a === 1 ? fav.c : 0,
      ev: P[0]*fav.c - 1,
      residu: (fav.a === 1 ? fav.c : 0) - P[0]*fav.c,
    });
  }
  // mise à jour de l'historique APRÈS avoir mesuré la course
  for (const p of d.parts||[]) if (p.a >= 1 && p.a <= 3) vu.set(`${norm(p.nom)}|${hip}`, true);
}

const st = a => {
  if (a.length < 40) return null;
  const g = a.map(x=>x.gain);
  const m = g.reduce((s,x)=>s+x,0)/a.length;
  const se = 100*Math.sqrt(g.reduce((s,x)=>s+(x-m)**2,0)/a.length/a.length);
  const r = a.reduce((s,x)=>s+x.residu,0)/a.length;
  const sr = 100*Math.sqrt(a.reduce((s,x)=>s+(x.residu-r)**2,0)/a.length/a.length);
  return { n:a.length, roi:100*(m-1), se, res:100*r, sr };
};
const f = r => r ? `${r.roi>=0?'+':''}${r.roi.toFixed(1)} % ± ${r.se.toFixed(1)} (n=${String(r.n).padStart(4)})` : '  (trop peu)';

console.log(`${L.length} courses mesurées (2023 → 2026, 2022 en amorce)\n`);
console.log('ROI DU FAVORI SELON QU\'IL S\'EST DÉJÀ PLACÉ SUR CETTE PISTE\n');
console.log('  groupe                     déjà placé ici             1re fois ici               écart');
for (const g of ['Longchamp / Saint-Cloud', 'Chantilly / Deauville']) {
  const a = L.filter(x=>x.groupe===g && x.dejaPlace);
  const b = L.filter(x=>x.groupe===g && !x.dejaPlace);
  const sa = st(a), sb = st(b);
  const ec = (sa&&sb) ? `${(sa.roi-sb.roi)>=0?'+':''}${(sa.roi-sb.roi).toFixed(1)} pt` : '—';
  console.log(`  ${g.padEnd(26)}${f(sa).padEnd(27)}${f(sb).padEnd(27)}${ec}`);
}
console.log('\n  part des favoris déjà placés sur la piste :');
for (const g of ['Longchamp / Saint-Cloud', 'Chantilly / Deauville']) {
  const a = L.filter(x=>x.groupe===g);
  console.log(`    ${g.padEnd(26)}${(100*a.filter(x=>x.dejaPlace).length/a.length).toFixed(1)} %  (n=${a.length})`);
}
console.log('\nL\'ÉCART ENTRE GROUPES EST-IL PORTÉ PAR LES « DÉJÀ PLACÉS » ?');
for (const [lib, sel] of [['déjà placés ici', x=>x.dejaPlace], ['1re fois ici', x=>!x.dejaPlace]]) {
  const a = st(L.filter(x=>x.groupe==='Longchamp / Saint-Cloud' && sel(x)));
  const b = st(L.filter(x=>x.groupe==='Chantilly / Deauville'  && sel(x)));
  if (!a || !b) { console.log(`  ${lib} — échantillon insuffisant`); continue; }
  const d = a.roi - b.roi, sd = Math.sqrt(a.se**2 + b.se**2);
  console.log(`  ${lib.padEnd(18)}Longchamp ${a.roi.toFixed(1)} %   Chantilly/Deauville ${b.roi.toFixed(1)} %   écart ${d>=0?'+':''}${d.toFixed(1)} ± ${sd.toFixed(1)} pt   t = ${(d/sd).toFixed(2)}`);
}
