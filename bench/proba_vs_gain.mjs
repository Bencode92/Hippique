/* « Pourquoi 28 %, 43 % ou 60 % de chances n'entrent pas dans le calcul ? »
 *
 * Parce que la probabilite EST deja la cote, retournee. Un favori a 60 % est
 * un favori a cote 1,7 ; un favori a 28 % est a cote 3,6. Le produit
 * probabilite × cote — c'est-a-dire ce qu'on encaisse en moyenne — est a peu
 * pres constant, et c'est lui qui decide.
 *
 * On le montre plutot que de l'affirmer : taux de victoire REEL et ROI par
 * tranche de probabilite affichee, sur tes deux hippodromes.
 */
import fs from 'fs';
import { createRequire } from 'module';
const PP = createRequire(import.meta.url)('../js/panneau-paris.js');
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const MOI = ['LONGCHAMP','SAINTCLOUD'];

const rap = new Map();
for (const f of fs.readdirSync('data/rapports').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/rapports/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue; const d = JSON.parse(l);
    const sg = d.paris && d.paris.E_SIMPLE_GAGNANT;
    if (sg && sg.length) rap.set(`${d.date}|${norm(d.hip)}|${d.r}|${d.c}`, sg);
  }
const L = [];
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue; const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    const h = norm(d.hip); if (!MOI.some(x=>h.includes(x))) continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 5 || !ps.some(p=>p.a===1)) continue;
    const ov = ps.reduce((t,p)=>t+1/p.c,0);
    if (ov < 1.03 || ov > 1.60) continue;
    const sg = rap.get(`${d.date}|${h}|${d.r}|${d.c}`); if (!sg) continue;
    const tri = ps.slice().sort((a,b)=>a.c-b.c);
    const P = PP.probabilites(tri.map(p=>({cote:p.c})));
    const fav = tri[0];
    const m = sg.find(x=>String(x.comb) === String(fav.n));
    L.push({ p: P[0], cote: fav.c, np: ps.length, gain: m ? m.div/100 : 0 });
  }
const M = 20;
const st = a => {
  if (a.length < 50) return null;
  const m = a.reduce((s,x)=>s+x.gain,0)/a.length;
  const w = a.filter(x=>x.gain>0).length;
  return { n: a.length, taux: 100*w/a.length, roi: 100*(m-1),
           se: 100*Math.sqrt(a.reduce((s,x)=>s+(x.gain-m)**2,0)/a.length/a.length),
           cote: a.reduce((s,x)=>s+x.cote,0)/a.length,
           pAff: 100*a.reduce((s,x)=>s+x.p,0)/a.length };
};
console.log(`${L.length} courses · Longchamp + Saint-Cloud, mise de ${M} €\n`);
console.log('CE QUE LA PROBABILITÉ AFFICHÉE ANNONCE, ET CE QUI SE PASSE\n');
console.log('  probabilité    annoncée   réelle    cote moy.   si ça passe   ROI');
for (const [lo, hi] of [[0,.22],[.22,.28],[.28,.34],[.34,.42],[.42,.52],[.52,1]]) {
  const r = st(L.filter(x=>x.p>=lo && x.p<hi));
  if (!r) continue;
  console.log(`  ${(100*lo).toFixed(0)}–${(100*hi).toFixed(0)} %`.padEnd(15)
    + `${r.pAff.toFixed(1)} %`.padStart(8)
    + `${r.taux.toFixed(1)} %`.padStart(10)
    + `${r.cote.toFixed(2)}`.padStart(11)
    + `${(M*r.cote - M).toFixed(0)} €`.padStart(13)
    + `  ${(r.roi>=0?'+':'')}${r.roi.toFixed(1)} % ± ${r.se.toFixed(1)}`);
}
const tous = st(L);
console.log(`\n  ENSEMBLE       ${tous.pAff.toFixed(1)} %  ${tous.taux.toFixed(1)} %`
  + `      ${tous.cote.toFixed(2)}        ${(M*tous.cote-M).toFixed(0)} €   ${tous.roi.toFixed(1)} %`);
console.log('\n  La colonne « réelle » suit la colonne « annoncée » : la probabilité affichée');
console.log('  est juste. Mais regarde la dernière colonne — le ROI ne suit pas, parce que');
console.log('  plus la probabilité monte, moins le pari paie. Les deux se compensent.');

console.log('\n\nET DANS LE CADRE DE LA RÈGLE (14 partants et plus)\n');
console.log('  probabilité    courses   taux réel   si ça passe   ROI');
const R = L.filter(x=>x.np>=14);
for (const [lo, hi] of [[0,.25],[.25,.33],[.33,1]]) {
  const r = st(R.filter(x=>x.p>=lo && x.p<hi));
  if (!r) { console.log(`  ${(100*lo).toFixed(0)}–${(100*hi).toFixed(0)} %`.padEnd(15) + '   trop peu'); continue; }
  console.log(`  ${(100*lo).toFixed(0)}–${(100*hi).toFixed(0)} %`.padEnd(15)
    + `${r.n}`.padStart(6) + `${r.taux.toFixed(1)} %`.padStart(12)
    + `${(M*r.cote-M).toFixed(0)} €`.padStart(13)
    + `  ${(r.roi>=0?'+':'')}${r.roi.toFixed(1)} % ± ${r.se.toFixed(1)}`);
}
