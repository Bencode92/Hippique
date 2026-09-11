/* Piste apparue le 11/09/2026 : sur les hippodromes premium, le favori des
 * courses a 14 partants et plus rendrait +26,2 % (n=177, avril-sept. 2026),
 * contre -17,5 % sur les memes grands champs hors premium.
 *
 * Avant d'y croire : la piste sort d'une longue exploration (fiabilite des
 * donnees, puis taille de champ), elle repose sur 177 courses, et son
 * intervalle vaut ±15,4. On la confronte donc aux quatre annees de data/histo,
 * ou l'echantillon est dix fois plus gros.
 *
 *     node bench/grands_champs_premium.mjs
 */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const PREM = ['LONGCHAMP','SAINTCLOUD','CHANTILLY','FONTAINEBLEAU','DEAUVILLE','LYONPARILLY'];
const MOI  = ['LONGCHAMP','SAINTCLOUD'];

const L = [];
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 5 || !ps.some(p=>p.a===1)) continue;
    const fav = ps.reduce((a,b)=>a.c<=b.c?a:b);
    const h = norm(d.hip);
    L.push({ an: d.date.slice(0,4), np: ps.length,
             prem: PREM.some(x=>h.includes(x)), moi: MOI.some(x=>h.includes(x)),
             gain: fav.a === 1 ? Math.max(1.10, fav.c) : 0 });
  }
const st = a => {
  if (a.length < 30) return null;
  const g = a.map(x=>x.gain), m = g.reduce((s,x)=>s+x,0)/g.length;
  return { roi: 100*(m-1), se: 100*Math.sqrt(g.reduce((s,x)=>s+(x-m)**2,0)/g.length/g.length), n: g.length };
};
const f = r => r ? `${r.roi>=0?'+':''}${r.roi.toFixed(1)} % ± ${r.se.toFixed(1)} (n=${String(r.n).padStart(4)})` : '   — trop peu';

console.log(`${L.length} courses de plat, 2022 → septembre 2026\n`);
console.log('ROI DU FAVORI PAR TAILLE DE CHAMP\n');
console.log('  champ          premium                      hors premium                 écart');
for (const [lib, sel] of [['< 9 partants', x=>x.np<9], ['9 à 13', x=>x.np>=9&&x.np<14], ['14 et plus', x=>x.np>=14]]) {
  const a = st(L.filter(x=> x.prem && sel(x))), b = st(L.filter(x=> !x.prem && sel(x)));
  const d = (a&&b) ? a.roi-b.roi : null, sd = (a&&b) ? Math.sqrt(a.se**2+b.se**2) : null;
  console.log(`  ${lib.padEnd(15)}${f(a).padEnd(29)}${f(b).padEnd(29)}` +
    (d===null ? '' : `${d>=0?'+':''}${d.toFixed(1)} ± ${sd.toFixed(1)}` + (Math.abs(d)>1.96*sd?'  ← tient':'  ← bruit')));
}
console.log('\nLE GRAND CHAMP PREMIUM, ANNÉE PAR ANNÉE — se réplique-t-il ?\n');
console.log('  année   premium 14+                  tes 2 hippodromes 14+');
let pos = 0, tot = 0;
for (const an of [...new Set(L.map(x=>x.an))].sort()) {
  const a = st(L.filter(x=>x.prem && x.np>=14 && x.an===an));
  const m = st(L.filter(x=>x.moi  && x.np>=14 && x.an===an));
  if (a) { tot++; if (a.roi > 0) pos++; }
  console.log(`  ${an}    ${f(a).padEnd(29)}${f(m)}`);
}
console.log(`\n  positif ${pos} année(s) sur ${tot}.`);
const g = st(L.filter(x=>x.prem && x.np>=14));
const g25 = st(L.filter(x=>x.prem && x.np>=14 && x.an>='2025'));
const g24 = st(L.filter(x=>x.prem && x.np>=14 && x.an< '2025'));
console.log(`\n  toutes années  ${f(g)}`);
console.log(`  2022-2024      ${f(g24)}`);
console.log(`  2025-2026      ${f(g25)}`);


// ── TES DEUX HIPPODROMES EN GRAND CHAMP ─────────────────────────────────
// Seule ligne positive cinq annees sur cinq du tableau ci-dessus. On la
// mesure globalement, et on la compare a ton terrain hors grand champ : si
// l'ecart n'est pas la, le « grand champ » n'ajoute rien a l'effet hippodrome
// deja connu.
console.log('\n' + '='.repeat(70));
console.log('TES DEUX HIPPODROMES, PAR TAILLE DE CHAMP — 2022 → 2026\n');
const moi14 = st(L.filter(x=>x.moi && x.np>=14));
const moiP  = st(L.filter(x=>x.moi && x.np<14));
const moiT  = st(L.filter(x=>x.moi));
console.log(`  14 partants et plus   ${f(moi14)}`);
console.log(`  moins de 14           ${f(moiP)}`);
console.log(`  ensemble              ${f(moiT)}`);
const d = moi14.roi - moiP.roi, sd = Math.sqrt(moi14.se**2 + moiP.se**2);
console.log(`\n  écart grand champ / reste : ${d>=0?'+':''}${d.toFixed(1)} ± ${sd.toFixed(1)} pt` +
  (Math.abs(d) > 1.96*sd ? '   ← DÉMONTRÉ' : '   ← dans le bruit'));
// et la replication par periode, le seul juge
const a1 = st(L.filter(x=>x.moi && x.np>=14 && x.an<'2025'));
const a2 = st(L.filter(x=>x.moi && x.np>=14 && x.an>='2025'));
console.log(`\n  réplication :  2022-2024 ${f(a1)}   2025-2026 ${f(a2)}`);
