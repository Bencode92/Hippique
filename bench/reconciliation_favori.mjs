/* Une seule mesure canonique du ROI du favori chez toi, et l'explication de
 * l'écart entre les deux chiffres qui circulent (+0,4 % et -4 %).
 *
 * La variante décisive : le ROI calculé sur la COTE affichée n'est pas le ROI
 * encaissé. Le dividende réellement payé est dans data/rapports/ ; en pari
 * mutuel il se fixe à la clôture du pool et diffère de la dernière cote vue. */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const MOI = ['LONGCHAMP','PARISLONGCHAMP','SAINTCLOUD'];

// rapports définitifs, indexés
const rap = new Map();
for (const f of fs.readdirSync('data/rapports').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/rapports/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    const sg = d.paris && d.paris.E_SIMPLE_GAGNANT;
    if (sg && sg.length) rap.set(`${d.date}|${norm(d.hip)}|${d.r}|${d.c}`, sg);
  }

const L = [];
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe !== 'PLAT' || !MOI.some(m=>norm(d.hip).includes(m))) continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 5) continue;
    const fav = ps.reduce((a,b)=>a.c<=b.c?a:b);
    const sg = rap.get(`${d.date}|${norm(d.hip)}|${d.r}|${d.c}`);
    // dividende réel du favori s'il gagne (div en centimes pour 1 € misé)
    let divReel = null;
    if (sg) { const m = sg.find(x=>String(x.comb)===String(fav.n)); divReel = m ? m.div/100 : 0; }
    L.push({ date:d.date, cote:fav.c, gagne:fav.a===1, divReel, aRapport:!!sg });
  }

const st = (a, gainFn) => {
  if (!a.length) return null;
  const g = a.map(gainFn);
  const m = g.reduce((s,x)=>s+x,0)/g.length;
  const se = 100*Math.sqrt(g.reduce((s,x)=>s+(x-m)*(x-m),0)/g.length/g.length);
  return { n:a.length, roi:100*(m-1), se };
};
const fmt = r => r ? `${r.roi>=0?'+':''}${r.roi.toFixed(1)} % ± ${r.se.toFixed(1)}  (n=${String(r.n).padStart(4)})` : '—';
const surCote    = x => x.gagne ? x.cote : 0;
const surRapport = x => x.divReel !== null ? x.divReel : (x.gagne ? x.cote : 0);

const avecRap = L.filter(x=>x.aRapport);
console.log(`Longchamp + Saint-Cloud, plat — ${L.length} courses, dont ${avecRap.length} avec rapport définitif\n`);
console.log('LA MÊME PRATIQUE, MESURÉE DE DEUX FAÇONS');
console.log('  sur la cote affichée      ', fmt(st(avecRap, surCote)));
console.log('  sur le dividende encaissé ', fmt(st(avecRap, surRapport)));

const ecarts = avecRap.filter(x=>x.gagne && x.divReel!==null)
  .map(x=>({c:x.cote, d:x.divReel, e:(x.divReel-x.cote)/x.cote}));
if (ecarts.length) {
  const med = a => { const s=a.slice().sort((p,q)=>p-q); return s[s.length>>1]; };
  const moy = ecarts.reduce((s,x)=>s+x.e,0)/ecarts.length;
  console.log(`\n  Sur les ${ecarts.length} favoris gagnants : dividende vs cote, écart médian ${(100*med(ecarts.map(x=>x.e))).toFixed(1)} %, moyen ${(100*moy).toFixed(1)} %`);
}

console.log('\nDÉCOUPAGES, tous sur le dividende encaissé');
for (const [lib, sel] of [
  ['toutes cotes           ', x=>true],
  ['favori <= 6            ', x=>x.cote<=6],
  ['avant 07/2025          ', x=>x.date<'2025-07'],
  ['depuis 07/2025         ', x=>x.date>='2025-07'],
]) console.log('  '+lib, fmt(st(avecRap.filter(sel), surRapport)));
