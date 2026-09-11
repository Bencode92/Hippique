/* Les deux seuils de la regle — 14 partants, favori a 4 — ont ete choisis sur
 * les donnees. S'ils ne marchent qu'a leur valeur exacte, c'est du
 * sur-ajustement et la regle ne vaut rien. S'ils marchent sur toute une plage,
 * l'effet est reel et le seuil n'est qu'une commodite.
 *
 * Simple gagnant sur le favori, Longchamp + Saint-Cloud, 2022 → 2026,
 * dividendes reels, plancher PMU 1,10.
 */
import fs from 'fs';
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
    const sg = rap.get(`${d.date}|${h}|${d.r}|${d.c}`); if (!sg) continue;
    const fav = ps.reduce((a,b)=>a.c<=b.c?a:b);
    const m = sg.find(x=>String(x.comb) === String(fav.n));
    L.push({ date: d.date, np: ps.length, cote: fav.c, gain: m ? m.div/100 : 0 });
  }
const st = a => {
  if (a.length < 40) return null;
  const m = a.reduce((s,x)=>s+x.gain,0)/a.length;
  return { roi: 100*(m-1), se: 100*Math.sqrt(a.reduce((s,x)=>s+(x.gain-m)**2,0)/a.length/a.length), n: a.length };
};
const cel = r => r ? `${(r.roi>=0?'+':'')}${r.roi.toFixed(0)}`.padStart(5) : '    ·';

console.log(`${L.length} courses · ROI du simple gagnant sur le favori\n`);
console.log('CARTE DE SENSIBILITÉ — chaque case est un couple de seuils\n');
console.log('  partants ≥      cote du favori ≥');
console.log('              2,5    3,0    3,5    4,0    4,5    5,0');
for (const np of [10, 11, 12, 13, 14, 15, 16]) {
  const cells = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
    .map(c => cel(st(L.filter(x => x.np >= np && x.cote >= c))));
  console.log(`  ${String(np).padStart(6)}      ${cells.join('  ')}`);
}
console.log('\n  (· = moins de 40 courses)  Les valeurs sont des ROI en %.\n');

console.log('DÉTAIL DES CASES VOISINES DE LA RÈGLE\n');
console.log('  seuils                ROI                n      courses/an');
for (const [np, c] of [[12,3.5],[13,3.5],[13,4],[14,3.5],[14,4],[14,4.5],[15,4],[14,5]]) {
  const r = st(L.filter(x => x.np >= np && x.cote >= c));
  if (!r) continue;
  const marque = (np === 14 && c === 4) ? '   ← la règle' : '';
  console.log(`  ${np}+ partants, cote ≥ ${c}` .padEnd(24)
    + `${(r.roi>=0?'+':'')}${r.roi.toFixed(1)} % ± ${r.se.toFixed(1)}`.padEnd(19)
    + `${String(r.n).padStart(4)}    ${(r.n/4.5).toFixed(0)}` + marque);
}
console.log('\nRÉPLICATION SUR DEUX MOITIÉS — la plage tient-elle des deux côtés ?\n');
console.log('  seuils                2022 → juin 2024      juillet 2024 → 2026');
for (const [np, c] of [[13,3.5],[14,3.5],[14,4],[14,4.5],[15,4]]) {
  const a = st(L.filter(x => x.np >= np && x.cote >= c && x.date <  '2024-07-01'));
  const b = st(L.filter(x => x.np >= np && x.cote >= c && x.date >= '2024-07-01'));
  const f = r => r ? `${(r.roi>=0?'+':'')}${r.roi.toFixed(1)} % (n=${r.n})`.padEnd(20) : '— trop peu'.padEnd(20);
  console.log(`  ${np}+ partants, cote ≥ ${c}`.padEnd(24) + f(a) + f(b)
    + (a && b && a.roi > 0 && b.roi > 0 ? '  ← positif des deux côtés' : ''));
}


// ── CE QUI COMPTE VRAIMENT : LES EUROS PAR AN ───────────────────────────
// Un ROI eleve sur peu de courses peut rapporter moins qu'un ROI moyen sur
// beaucoup. On classe donc par gain ANNUEL a 20 € la mise, avec son
// incertitude — et l'on regarde ce que la seconde moitie de l'historique
// aurait donne, seule facon de ne pas se payer de mots.
const M = 20, ANS = 4.5;
const lignes = [];
for (const np of [10,11,12,13,14,15,16])
  for (const c of [2.5,3,3.5,4,4.5,5]) {
    const a = L.filter(x => x.np >= np && x.cote >= c);
    const r = st(a); if (!r || a.length < 100) continue;
    const b = st(L.filter(x => x.np >= np && x.cote >= c && x.date >= '2024-07-01'));
    const parAn = a.length / ANS;
    lignes.push({ np, c, roi: r.roi, se: r.se, n: a.length, parAn,
                  euros: M * parAn * r.roi / 100,
                  eurosSe: M * parAn * r.se / 100,
                  roiB: b ? b.roi : null, eurosB: b ? M * (b.n / 2.2) * b.roi / 100 : null });
  }
lignes.sort((x, y) => y.euros - x.euros);
console.log('\n' + '='.repeat(76));
console.log('CLASSÉ PAR GAIN ANNUEL, mise de 20 € — ce que ça met dans la poche\n');
console.log('  seuils              courses/an   ROI          gain/an          seconde moitié');
for (const l of lignes.slice(0, 10)) {
  const marque = (l.np === 14 && l.c === 4) ? ' ←' : '';
  console.log(`  ${l.np}+ part., cote ≥ ${l.c}`.padEnd(22)
    + `${l.parAn.toFixed(0)}`.padStart(6) + '      '
    + `${(l.roi>=0?'+':'')}${l.roi.toFixed(1)} %`.padStart(7) + '   '
    + `${(l.euros>=0?'+':'')}${l.euros.toFixed(0)} € ± ${l.eurosSe.toFixed(0)}`.padEnd(16)
    + (l.roiB === null ? '' : `${(l.roiB>=0?'+':'')}${l.roiB.toFixed(1)} %  ${(l.eurosB>=0?'+':'')}${l.eurosB.toFixed(0)} €/an`)
    + marque);
}
console.log('\n  Le classement par euros n\'est pas le classement par ROI : plus de courses');
console.log('  compense un rendement plus faible, jusqu\'a un certain point.');
