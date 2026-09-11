/* Le 2 sur 4 gagne souvent — les deux chevaux choisis n'ont qu'a finir dans
 * les quatre premiers. Mais un pari qui passe souvent paie peu. Lequel des
 * deux l'emporte, et surtout : dans un GRAND CHAMP, ou quatre places sur
 * seize sont plus dures a prendre que quatre sur huit ?
 *
 * Dividendes reels, plancher PMU 1,10, mise plate. Une course ou le pari
 * n'etait pas propose est exclue, jamais comptee perdue.
 */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const MOI = ['LONGCHAMP','SAINTCLOUD'];
const rap = new Map();
for (const f of fs.readdirSync('data/rapports').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/rapports/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue; const d = JSON.parse(l);
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
    if (!l.trim()) continue; const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    const h = norm(d.hip); if (!MOI.some(x=>h.includes(x))) continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 5 || !ps.some(p=>p.a===1)) continue;
    const ov = ps.reduce((t,p)=>t+1/p.c,0);
    if (ov < 1.03 || ov > 1.60) continue;
    const paris = rap.get(`${d.date}|${h}|${d.r}|${d.c}`); if (!paris) continue;
    const tri = ps.slice().sort((a,b)=>a.c-b.c);
    if (tri.length < 5) continue;
    const seg = ps.length >= 14 ? 'grand' : 'petit';
    const n = i => tri[i].n;
    for (const [i, j] of [[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[2,3]])
      add(`${seg}|${i}-${j}`, div(paris,'E_DEUX_SUR_QUATRE',[n(i),n(j)]));
    add(`${seg}|simple`, div(paris,'E_SIMPLE_GAGNANT',[n(0)]));
  }
const st = a => {
  if (!a || a.length < 60) return null;
  const m = a.reduce((s,x)=>s+x,0)/a.length;
  const w = a.filter(x=>x>0);
  return { roi: 100*(m-1), se: 100*Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length/a.length),
           n: a.length, taux: 100*w.length/a.length,
           divMoy: w.length ? w.reduce((s,x)=>s+x,0)/w.length : 0 };
};
const M = 10;
console.log('2 SUR 4 — Longchamp + Saint-Cloud, mise de 10 €\n');
for (const [seg, lib] of [['grand','GRAND CHAMP (14 partants et plus) — le cadre de la règle'],
                          ['petit','PETIT CHAMP (moins de 14)']]) {
  console.log(`  ${lib}\n`);
  console.log('    combinaison        ça passe    si ça passe   ROI              €/an');
  for (const [cle, nom] of [['0-1','favori + 2e'],['0-2','favori + 3e'],['0-3','favori + 4e'],
                            ['0-4','favori + 5e'],['1-2','2e + 3e'],['1-3','2e + 4e'],['2-3','3e + 4e'],
                            ['simple','— simple gagnant, pour comparer']]) {
    const r = st(acc[`${seg}|${cle}`]);
    if (!r) { continue; }
    const parAn = r.n / 4.5;
    console.log(`    ${nom.padEnd(19)}${r.taux.toFixed(1).padStart(5)} %    ` +
      `${(M*r.divMoy).toFixed(2).padStart(7)} €   ` +
      `${(r.roi>=0?'+':'')}${r.roi.toFixed(1)} % ± ${r.se.toFixed(1)}`.padEnd(16) +
      `${(M*parAn*r.roi/100>=0?'+':'')}${(M*parAn*r.roi/100).toFixed(0)} €`.padStart(7));
  }
  console.log();
}
console.log('  « si ça passe » = ce que rapportent 10 € misés, quand le pari est gagnant.');
