/* Le levier dominant hors marché est la dérive, dans six segments sur neuf et
 * sur les trois découpes de terrain (+0,14 partout). Sur data/courses, ton
 * terrain ne compte que 179 courses : le ROI du modèle y affiche +12 % avec un
 * intervalle de [-12,7 ; +36,7], et l'effet s'évapore dès qu'on ajoute
 * Saint-Cloud. Autant dire rien.
 *
 * data/histo remonte a 2022 : 1 127 courses a Longchamp, six fois plus. La
 * Valeur FG y manque, mais la dérive s'y calcule (cote de référence → cote
 * finale). On teste donc le seul levier qui remonte systématiquement, là où
 * l'échantillon permet de conclure.
 *
 * PROTOCOLE : train 2022 → 2024 sur TOUS les hippodromes sauf le terrain
 * testé ; test sur le terrain, 2025 → 2026. Poids de dérive balayé, ROI mesuré
 * sur le favori du modèle.
 *
 *     node bench/derive_longchamp.mjs
 */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

const courses = [];
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    const ps = (d.parts||[]).filter(p=>p.c>1 && p.cr>1);
    if (ps.length < 5 || !ps.some(p=>p.a===1)) continue;
    const inv = ps.reduce((s,p)=>s+1/p.c,0);
    courses.push({
      date: d.date, hip: norm(d.hip),
      lp: ps.map(p=>Math.log((1/p.c)/inv)),
      der: ps.map(p=>(p.cr - p.c)/p.cr),
      cotes: ps.map(p=>p.c),
      g: ps.findIndex(p=>p.a===1),
    });
  }
// standardisation de la dérive à l'intérieur de chaque course
for (const c of courses) {
  const m = c.der.reduce((s,x)=>s+x,0)/c.der.length;
  const sd = Math.sqrt(c.der.reduce((s,x)=>s+(x-m)**2,0)/c.der.length) || 1;
  c.der = c.der.map(x=>(x-m)/sd);
}

const choisi = (c, w) => {
  let b = 0, sb = -Infinity;
  for (let i=0;i<c.lp.length;i++) { const s = c.lp[i] + w*c.der[i];
    if (s > sb || (s === sb && c.cotes[i] < c.cotes[b])) { sb = s; b = i; } }
  return b;
};
const roi = (jeu, w) => {
  const g = jeu.map(c => { const i = choisi(c, w); return i === c.g ? Math.max(1.10, c.cotes[i]) : 0; });
  const m = g.reduce((s,x)=>s+x,0)/g.length;
  const se = 100*Math.sqrt(g.reduce((s,x)=>s+(x-m)**2,0)/g.length/g.length);
  return { roi: 100*(m-1), se, n: g.length, t1: 100*g.filter(x=>x>0).length/g.length };
};

const TERRAINS = [
  ['Longchamp',           h => h.includes('LONGCHAMP')],
  ['Saint-Cloud',         h => h.includes('SAINTCLOUD')],
  ['Longchamp+St-Cloud',  h => h.includes('LONGCHAMP') || h.includes('SAINTCLOUD')],
];
console.log(`${courses.length} courses de plat avec cote de référence, 2022 → 2026\n`);
for (const [nom, f] of TERRAINS) {
  const tr = courses.filter(c => !f(c.hip) && c.date < '2025-01-01');
  const te = courses.filter(c =>  f(c.hip) && c.date >= '2025-01-01');
  if (te.length < 150) { console.log(`  ${nom} — trop peu (${te.length})`); continue; }
  // poids choisi sur le train, hors du terrain testé
  let best = null;
  for (let w = 0; w <= 1.0; w += 0.05) {
    const r = roi(tr, w);
    if (!best || r.roi > best.r.roi) best = { w, r };
  }
  const ici0 = roi(te, 0), iciW = roi(te, best.w);
  const d = iciW.roi - ici0.roi, sd = Math.sqrt(iciW.se**2 + ici0.se**2);
  console.log(`  ${nom}   train ${tr.length} (ailleurs, 2022-2024) · test ${te.length} (ici, 2025-2026)`);
  console.log(`    poids de dérive retenu sur le train : ${best.w.toFixed(2)}  (ROI train ${best.r.roi.toFixed(1)} %)`);
  console.log(`    ICI, cote seule          ROI ${ici0.roi >= 0 ? '+' : ''}${ici0.roi.toFixed(1)} % ± ${ici0.se.toFixed(1)}   top1 ${ici0.t1.toFixed(1)} %`);
  console.log(`    ICI, cote + dérive       ROI ${iciW.roi >= 0 ? '+' : ''}${iciW.roi.toFixed(1)} % ± ${iciW.se.toFixed(1)}   top1 ${iciW.t1.toFixed(1)} %`);
  console.log(`    écart ${d >= 0 ? '+' : ''}${d.toFixed(1)} ± ${sd.toFixed(1)} pt   ${Math.abs(d) > 1.96*sd ? (d>0?'← DÉMONTRÉ':'← pire, démontré') : '← dans le bruit'}\n`);
}
