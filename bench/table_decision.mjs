/* LA table : sur tes deux hippodromes, quoi jouer et quand.
 * Dividendes réels des rapports définitifs, plancher PMU 1,10, mise plate.
 * Une course où le pari n'était pas proposé est exclue, jamais comptée perdue.
 */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const MOI = ['LONGCHAMP','SAINTCLOUD'];

const rap = new Map();
for (const f of fs.readdirSync('data/rapports').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/rapports/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    rap.set(`${d.date}|${norm(d.hip)}|${d.r}|${d.c}`, d.paris || {});
  }
const div = (paris, type, nums) => {
  const l = paris[type]; if (!l || !l.length) return null;
  const cle = nums.slice().sort((a,b)=>a-b).join('-');
  for (const x of l) if (String(x.comb).split('-').map(Number).sort((a,b)=>a-b).join('-') === cle) return x.div/100;
  return 0;
};

const acc = {};
const add = (k, g) => { if (g !== null) (acc[k] = acc[k] || []).push(g); };
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    const h = norm(d.hip); if (!MOI.some(x=>h.includes(x))) continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 5 || !ps.some(p=>p.a===1)) continue;
    const paris = rap.get(`${d.date}|${h}|${d.r}|${d.c}`); if (!paris) continue;
    const tri = ps.slice().sort((a,b)=>a.c-b.c);
    const seg = ps.length >= 14 ? 'grand' : 'petit';
    const n = i => tri[i].n;
    add(`${seg}|simple gagnant`, div(paris,'E_SIMPLE_GAGNANT',[n(0)]));
    add(`${seg}|couplé gagnant`, div(paris,'E_COUPLE_GAGNANT',[n(0),n(1)]));
    add(`${seg}|2 sur 4`,        div(paris,'E_DEUX_SUR_QUATRE',[n(0),n(1)]));
    if (tri.length >= 3) add(`${seg}|trio`, div(paris,'E_TRIO',[n(0),n(1),n(2)]));
  }

const M = 20;
const st = a => {
  if (!a || a.length < 30) return null;
  const m = a.reduce((s,x)=>s+x,0)/a.length;
  const se = 100*Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length/a.length);
  return { roi:100*(m-1), se, n:a.length, net: M*a.length*(m-1), an: M*a.length*(m-1)/4.5 };
};
console.log('LONGCHAMP + SAINT-CLOUD, 2022 → 2026 · mise de 20 € · dividendes réels\n');
console.log('                        GRAND CHAMP (14+)                    PETIT CHAMP (<14)');
console.log('  instrument        ROI        sur 4 ans   /an      ROI        sur 4 ans   /an');
for (const i of ['simple gagnant','couplé gagnant','2 sur 4','trio']) {
  const g = st(acc[`grand|${i}`]), p = st(acc[`petit|${i}`]);
  const f = r => r ? `${(r.roi>=0?'+':'')}${r.roi.toFixed(1)} %±${r.se.toFixed(0)}`.padEnd(12)
                     + `${(r.net>=0?'+':'')}${r.net.toFixed(0)} €`.padStart(8)
                     + `${(r.an>=0?'+':'')}${r.an.toFixed(0)} €`.padStart(7) : '—'.padEnd(27);
  console.log(`  ${i.padEnd(17)}${f(g)}   ${f(p)}`);
}
console.log('\n  (le couplé et le 2 sur 4 portent sur favori + 2e, le trio sur les 3 favoris)');
