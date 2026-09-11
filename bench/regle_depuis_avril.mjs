/* La regle sur avril → septembre 2026, la seule periode ou data/courses donne
 * la cote de reference de CHAQUE partant — donc la derive complete.
 *
 * Deux questions :
 *   1. qu'a rendu la regle sur cette periode, en euros ?
 *   2. la derive du favori, disponible ici, y ajoute-t-elle quelque chose ?
 *
 * La cote finale EST le dividende du simple gagnant (verifie sur 729 favoris
 * gagnants, ecart median 0,0 % avec les rapports definitifs), plancher 1,10.
 */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const MOI = ['LONGCHAMP','SAINTCLOUD'];
const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : null; };

const L = [];
for (const f of fs.readdirSync('data/courses').filter(x=>/^2026-\d\d-\d\d_/.test(x)).sort()) {
  const d = JSON.parse(fs.readFileSync('data/courses/'+f, 'utf8'));
  if ((d.type_reunion||'').toLowerCase() !== 'plat') continue;
  const h = norm(d.hippodrome); if (!MOI.some(x=>h.includes(x))) continue;
  for (const c of d.courses||[]) {
    const ps = (c.participants||[]).filter(p => (num(p.cote)||0) > 1);
    if (ps.length < 5 || !ps.some(p => parseInt(p.arrivee) === 1)) continue;
    const ov = ps.reduce((t,p)=>t+1/num(p.cote), 0);
    if (ov < 1.03 || ov > 1.60) continue;
    const fav = ps.reduce((a,b)=> num(a.cote) <= num(b.cote) ? a : b);
    const cote = Math.max(1.10, num(fav.cote)), cr = num(fav.cote_reference);
    // derive du favori : sa cote a-t-elle baisse depuis le matin ?
    const der = (cr && cr > 1) ? (cr - cote) / cr : null;
    // part des partants dont la cote a BAISSE : dispersion du pari du public
    const avecCr = ps.filter(p => (num(p.cote_reference)||0) > 1);
    const baisse = avecCr.length ? avecCr.filter(p => num(p.cote) < num(p.cote_reference)).length / avecCr.length : null;
    L.push({ date: f.slice(0,10), mois: f.slice(0,7), hip: d.hippodrome, nom: c.nom,
             np: ps.length, cote, der, baisse,
             gain: parseInt(fav.arrivee) === 1 ? cote : 0 });
  }
}
const M = 20;
const st = a => {
  if (!a.length) return null;
  const m = a.reduce((s,x)=>s+x.gain,0)/a.length;
  return { n: a.length, w: a.filter(x=>x.gain>0).length, roi: 100*(m-1),
           se: 100*Math.sqrt(a.reduce((s,x)=>s+(x.gain-m)**2,0)/a.length/a.length),
           net: M*a.length*(m-1) };
};
const R = L.filter(x=>x.np>=14);
console.log(`LA RÈGLE DEPUIS AVRIL 2026 — ${L.length} courses sur ton terrain, dont ${R.length} à 14 partants et plus\n`);
console.log('  mois      courses   gagnées   misé    résultat');
for (const m of [...new Set(R.map(x=>x.mois))].sort()) {
  const a = R.filter(x=>x.mois===m), s = st(a);
  console.log(`  ${m}      ${String(a.length).padStart(3)}       ${String(s.w).padStart(2)}     ${String(M*a.length).padStart(4)} €   ${(s.net>=0?'+':'')}${s.net.toFixed(0)} €`);
}
const S = st(R), H = st(L.filter(x=>x.np<14));
console.log('  ────────────────────────────────────────────────');
console.log(`  TOTAL     ${String(R.length).padStart(3)}       ${String(S.w).padStart(2)}     ${String(M*R.length).padStart(4)} €   ${(S.net>=0?'+':'')}${S.net.toFixed(0)} €   (${(S.roi>=0?'+':'')}${S.roi.toFixed(1)} % ± ${S.se.toFixed(1)})`);
console.log(`  écartées  ${String(H.n).padStart(3)}       ${String(H.w).padStart(2)}     ${String(M*H.n).padStart(4)} €   ${(H.net>=0?'+':'')}${H.net.toFixed(0)} €   (${H.roi.toFixed(1)} % ± ${H.se.toFixed(1)})`);

console.log('\n\nLA DÉRIVE AJOUTE-T-ELLE QUELQUE CHOSE, DANS LA RÈGLE ?\n');
const avecDer = R.filter(x=>x.der !== null);
console.log(`  ${avecDer.length} des ${R.length} courses ont la cote de référence du favori\n`);
console.log('  filtre supplémentaire            courses   ROI               résultat');
const f = (a, lib) => {
  const s = st(a);
  if (!s || s.n < 15) return console.log(`  ${lib.padEnd(33)}${String(s?s.n:0).padStart(5)}   — trop peu`);
  console.log(`  ${lib.padEnd(33)}${String(s.n).padStart(5)}   ${(s.roi>=0?'+':'')}${s.roi.toFixed(1)} % ± ${s.se.toFixed(1)}`.padEnd(70)
    + `${(s.net>=0?'+':'')}${s.net.toFixed(0)} €`);
};
f(avecDer, 'aucun (la règle telle quelle)');
f(avecDer.filter(x=>x.der > 0), 'favori qui a baissé');
f(avecDer.filter(x=>x.der <= 0), 'favori qui a monté');
f(avecDer.filter(x=>x.der > 0.1), 'favori qui a baissé de 10 %+');
const b = avecDer.filter(x=>x.baisse !== null);
f(b.filter(x=>x.baisse >= 0.5), 'la moitié du champ a baissé');
f(b.filter(x=>x.baisse < 0.5), 'moins de la moitié a baissé');
