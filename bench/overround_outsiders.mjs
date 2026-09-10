/* Hypothèse de l'expert, pré-spécifiée avant mesure :
 *
 *   Dans un mutuel à prélèvement fixe, un overround élevé ne vient pas de la
 *   taxe mais de l'arrondi des cotes, qui pèse surtout sur les outsiders. Un
 *   overround élevé signale donc une course où le public a dispersé son argent
 *   sur des chevaux à 20, 30, 50 — configuration du biais favori/outsider, où
 *   le favori est le plus sous-joué.
 *
 *   Test : décomposer Σ(1/cote) en part des chevaux à cote > 15 et part des
 *   autres. Si l'effet suit la PREMIÈRE composante et pas la SECONDE, le
 *   mécanisme est identifié — et transportable hors de Longchamp.
 *
 * Mesure : le résidu de calibration par course, gain − p×cote, dont la moyenne
 * vaut ROI − espérance modèle. Un résidu positif = le favori gagne plus souvent
 * que sa part du pool ne l'annonce. */
import fs from 'fs';
import { createRequire } from 'module';
const PP = createRequire(import.meta.url)('../js/panneau-paris.js');
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const MOI = ['LONGCHAMP','PARISLONGCHAMP','SAINTCLOUD'];
const SEUIL = 15;   // « outsider » au sens de l'expert

const L = [];
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 5) continue;
    const tri = ps.slice().sort((a,b)=>a.c-b.c);
    const P = PP.probabilites(tri.map(p=>({cote:p.c})));
    const ovOut   = ps.filter(p=>p.c >  SEUIL).reduce((s,p)=>s+1/p.c, 0);
    const ovCourt = ps.filter(p=>p.c <= SEUIL).reduce((s,p)=>s+1/p.c, 0);
    const fav = tri[0];
    L.push({
      date: d.date, chezMoi: MOI.some(m=>norm(d.hip).includes(m)),
      ovOut, ovCourt, np: ps.length,
      residu: (fav.a === 1 ? fav.c : 0) - P[0]*fav.c,
    });
  }

const stat = a => {
  const m = a.reduce((s,x)=>s+x.residu,0)/a.length;
  const se = Math.sqrt(a.reduce((s,x)=>s+(x.residu-m)**2,0)/a.length/a.length);
  return { n:a.length, m:100*m, se:100*se };
};
const f = r => `${r.m>=0?'+':''}${r.m.toFixed(1)} ± ${r.se.toFixed(1)} pt (n=${String(r.n).padStart(5)})`;
const quintiles = (a, k) => {
  const s = a.slice().sort((x,y)=>x[k]-y[k]);
  return [0,1,2,3,4].map(i => s.slice(Math.floor(i*s.length/5), Math.floor((i+1)*s.length/5)));
};

console.log(`${L.length} courses de plat, France entière\n`);
console.log('RÉSIDU DE CALIBRATION PAR QUINTILE  (le favori gagne-t-il plus que sa part du pool ?)\n');
for (const [lib, k] of [['part des OUTSIDERS (cote > 15)', 'ovOut'], ['part des COURTS (cote <= 15)', 'ovCourt']]) {
  console.log('  ' + lib);
  quintiles(L, k).forEach((q, i) => {
    const med = q.map(x=>x[k]).sort((a,b)=>a-b)[q.length>>1];
    console.log(`    Q${i+1}  ${k} médian ${med.toFixed(3)}   résidu ${f(stat(q))}`);
  });
  console.log();
}

// ── L'effet Longchamp survit-il au contrôle de la composante outsiders ? ──
console.log('L\'EFFET LONGCHAMP EST-IL CETTE COMPOSANTE ?');
const qs = quintiles(L, 'ovOut');
console.log('  quintile ovOut   chez toi                    ailleurs                    écart');
qs.forEach((q, i) => {
  const a = q.filter(x=>x.chezMoi), b = q.filter(x=>!x.chezMoi);
  if (a.length < 60) return console.log(`    Q${i+1}  (trop peu chez toi : ${a.length})`);
  const sa = stat(a), sb = stat(b);
  console.log(`    Q${i+1}  ${f(sa).padEnd(28)}${f(sb).padEnd(28)}${(sa.m-sb.m>=0?'+':'')}${(sa.m-sb.m).toFixed(1)} pt`);
});

// ── Transportabilité : hors de ses hippodromes uniquement ────────────────
console.log('\nTRANSPORTABILITÉ — la composante outsiders prédit-elle HORS de Longchamp ?');
const ail = L.filter(x=>!x.chezMoi);
quintiles(ail, 'ovOut').forEach((q,i) => console.log(`    Q${i+1}  ${f(stat(q))}`));

// ── Validation hors échantillon ──────────────────────────────────────────
console.log('\nHORS ÉCHANTILLON — seuil fixé sur 2022→juin 2025, appliqué ensuite');
const tr = ail.filter(x=>x.date <  '2025-07');
const te = ail.filter(x=>x.date >= '2025-07');
const seuilQ5 = tr.map(x=>x.ovOut).sort((a,b)=>a-b)[Math.floor(0.8*tr.length)];
console.log(`    seuil du dernier quintile (train) : ovOut >= ${seuilQ5.toFixed(3)}`);
console.log(`    TRAIN  au-dessus ${f(stat(tr.filter(x=>x.ovOut>=seuilQ5)))}   en dessous ${f(stat(tr.filter(x=>x.ovOut<seuilQ5)))}`);
console.log(`    TEST   au-dessus ${f(stat(te.filter(x=>x.ovOut>=seuilQ5)))}   en dessous ${f(stat(te.filter(x=>x.ovOut<seuilQ5)))}`);
