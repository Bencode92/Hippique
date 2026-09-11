/* « L'Optimale fait-elle moins bien que la cote ? » — la comparaison affichée
 * jusqu'ici ne permettait pas de répondre : les deux taux venaient d'univers
 * différents. Le marché était mesuré sur 14 620 courses toutes catégories,
 * l'Optimale sur 628 courses premium depuis le 16/04/2026.
 *
 * On remet les deux sur le même univers, celui que best_formulas.json déclare
 * dans son champ _source.
 *
 *     node bench/optimale_vs_marche.mjs
 */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const PREMIUM = ['LONGCHAMP','SAINTCLOUD','CHANTILLY','FONTAINEBLEAU','DEAUVILLE','LYONPARILLY'];
const DEBUT = '2026-04-16';

const bf = JSON.parse(fs.readFileSync('data/best_formulas.json','utf8'));
const U = {};
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 5) continue;
    const fav = ps.reduce((a,b)=>a.c<=b.c?a:b);
    const h = norm(d.hip), rec = { gagne: fav.a === 1 };
    (U.tout = U.tout || []).push(rec);
    if (d.date >= DEBUT && PREMIUM.some(x=>h.includes(x))) (U.premium = U.premium || []).push(rec);
    if (d.date >= DEBUT && (h.includes('LONGCHAMP') || h.includes('SAINTCLOUD'))) (U.moi = U.moi || []).push(rec);
  }
const t1 = a => {
  const k = a.filter(x=>x.gagne).length, p = k/a.length;
  return { p:100*p, se:100*Math.sqrt(p*(1-p)/a.length), n:a.length };
};
const f = r => `${r.p.toFixed(1)} % ± ${r.se.toFixed(1)} (n=${String(r.n).padStart(5)})`;

console.log('TOP 1 — le n°1 du classement gagne-t-il ?\n');
console.log('  MARCHÉ (rang par la cote)');
console.log('    toutes courses 2022-2026            ', f(t1(U.tout)));
console.log('    premium depuis le 16/04/2026        ', f(t1(U.premium)), '  ← univers de l\'Optimale');
console.log('    Longchamp + Saint-Cloud, même date  ', f(t1(U.moi)));
const o = bf.tous;
console.log(`\n  OPTIMALE (best_formulas.json, bucket « tous »)`);
console.log(`    premium depuis le 16/04/2026         ${o.top1.toFixed(1)} % (n=${o.courses})`);
console.log(`    leviers : ${o.leviers.join(' · ')}   poids : ${o.poids.join(' / ')}`);

const m = t1(U.premium);
const d = o.top1 - m.p;
console.log(`\n  ÉCART sur l'univers commun : ${d>=0?'+':''}${d.toFixed(1)} pt, pour une erreur-type de ±${m.se.toFixed(1)}.`);
console.log('  Les deux sont à égalité — mais l\'Optimale a CHOISI ses leviers et ses poids');
console.log('  sur ces mêmes courses. Son taux est une borne supérieure, celui du marché non.');
console.log(`\n  Taille des buckets de calibration (n de courses par formule) :`);
const b = Object.entries(bf).filter(([k,v])=>!k.startsWith('_') && v.courses)
  .sort((a,b)=>a[1].courses-b[1].courses);
console.log('    ' + b.slice(0,6).map(([k,v])=>`${k} ${v.courses}`).join(' · '));
console.log(`    médiane ${b[b.length>>1][1].courses} courses par formule — choisir des poids là-dessus`);
console.log('    surapprend : c\'est le même mécanisme que le badge JOUABLE d\'hier.');
