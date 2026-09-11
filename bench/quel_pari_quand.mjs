/* Quand jouer quoi : ROI de chaque instrument, par taille de champ ET par
 * ouverture de course. Dividendes réels, plancher PMU 1,10, mise plate.
 * Une course où le pari n'est pas proposé est exclue, jamais comptée perdue.
 *
 * Deux passes : la France entière d'abord — 17 500 courses, assez pour que
 * chaque case ait un sens — puis tes deux hippodromes, pour vérifier que la
 * règle y tient aussi.
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
const INSTR = [
  ['simple',   p => [p[0]],            'E_SIMPLE_GAGNANT'],
  ['couplé',   p => [p[0], p[1]],      'E_COUPLE_GAGNANT'],
  ['2 sur 4',  p => [p[0], p[1]],      'E_DEUX_SUR_QUATRE'],
  ['trio',     p => [p[0], p[1], p[2]],'E_TRIO'],
];
const CHAMP = [['petit <9', n=>n<9], ['moyen 9-13', n=>n>=9&&n<14], ['grand 14+', n=>n>=14]];
const OUV   = [['fermée fav<2,5', c=>c<2.5], ['moyenne 2,5-4', c=>c>=2.5&&c<4], ['ouverte fav>=4', c=>c>=4]];

const acc = {};
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 5 || !ps.some(p=>p.a===1)) continue;
    const h = norm(d.hip);
    const paris = rap.get(`${d.date}|${h}|${d.r}|${d.c}`); if (!paris) continue;
    const tri = ps.slice().sort((a,b)=>a.c-b.c);
    if (tri.length < 3) continue;
    const ch = (CHAMP.find(([,f2])=>f2(ps.length))||[])[0];
    const ou = (OUV.find(([,f2])=>f2(tri[0].c))||[])[0];
    if (!ch || !ou) continue;
    const nums = tri.map(p=>p.n);
    for (const [nom, sel, type] of INSTR) {
      const g = div(paris, type, sel(nums));
      if (g === null) continue;
      for (const terrain of ['FR', ...(MOI.some(x=>h.includes(x)) ? ['MOI'] : [])])
        (acc[`${terrain}|${ch}|${ou}|${nom}`] = acc[`${terrain}|${ch}|${ou}|${nom}`] || []).push(g);
    }
  }

const st = a => {
  if (!a || a.length < 60) return null;
  const m = a.reduce((s,x)=>s+x,0)/a.length;
  return { roi: 100*(m-1), se: 100*Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length/a.length), n: a.length };
};
for (const [terrain, titre] of [['FR','FRANCE ENTIÈRE — 17 500 courses de plat'],
                                ['MOI','TES DEUX HIPPODROMES — vérification']]) {
  console.log(`\n${titre}\n`);
  console.log('  champ        ouverture         simple      couplé      2 sur 4     trio        → à jouer');
  for (const [ch] of CHAMP) for (const [ou] of OUV) {
    const vals = INSTR.map(([nom]) => ({ nom, r: st(acc[`${terrain}|${ch}|${ou}|${nom}`]) }));
    if (vals.every(v => !v.r)) { continue; }
    const dispo = vals.filter(v => v.r);
    const best = dispo.reduce((a,b) => b.r.roi > a.r.roi ? b : a);
    const f = v => v.r ? `${(v.r.roi>=0?'+':'')}${v.r.roi.toFixed(1)}`.padStart(6)
                       + (v === best ? '*' : ' ') : '     —';
    const n = dispo[0].r.n;
    console.log(`  ${ch.padEnd(12)} ${ou.padEnd(17)}${vals.map(f).join('   ')}   ${best.nom}` +
      (best.r.roi > 0 ? '  ← positif' : '') + `   (n≈${n})`);
  }
}
console.log('\n  * = meilleur de la ligne.  Toutes les valeurs sont des ROI en %, mise plate.');


// ── LA TABLE SE RÉPLIQUE-T-ELLE ? ───────────────────────────────────────
// « Meilleur instrument de la case » est le maximum de quatre mesures
// bruitées : il est flatteur par construction. Le seul juge est la
// réplication. On refait la table sur deux moitiés de l'historique et l'on
// compte combien de cases désignent le MÊME instrument.
const acc2 = {};
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 5 || !ps.some(p=>p.a===1)) continue;
    const h = norm(d.hip);
    const paris = rap.get(`${d.date}|${h}|${d.r}|${d.c}`); if (!paris) continue;
    const tri = ps.slice().sort((a,b)=>a.c-b.c);
    if (tri.length < 3) continue;
    const ch = (CHAMP.find(([,f2])=>f2(ps.length))||[])[0];
    const ou = (OUV.find(([,f2])=>f2(tri[0].c))||[])[0];
    if (!ch || !ou) continue;
    const per = d.date < '2024-07-01' ? 'A' : 'B';
    const nums = tri.map(p=>p.n);
    for (const [nom, sel, type] of INSTR) {
      const g = div(paris, type, sel(nums));
      if (g === null) continue;
      for (const t of ['FR', ...(MOI.some(x=>h.includes(x)) ? ['MOI'] : [])])
        (acc2[`${t}|${per}|${ch}|${ou}|${nom}`] = acc2[`${t}|${per}|${ch}|${ou}|${nom}`] || []).push(g);
    }
  }
const meilleur = (t, per, ch, ou) => {
  const v = INSTR.map(([nom]) => ({ nom, r: st(acc2[`${t}|${per}|${ch}|${ou}|${nom}`]) })).filter(x=>x.r);
  if (!v.length) return null;
  return v.reduce((a,b)=> b.r.roi > a.r.roi ? b : a);
};
console.log('\n' + '='.repeat(78));
console.log('LE « MEILLEUR INSTRUMENT » EST-IL LE MÊME SUR DEUX PÉRIODES ?');
console.log('  période A : 2022 → juin 2024      période B : juillet 2024 → 2026\n');
for (const [t, titre] of [['FR','France entière'], ['MOI','tes deux hippodromes']]) {
  let pareil = 0, compte = 0;
  console.log(`  ${titre}`);
  console.log('    champ        ouverture          période A        période B      accord');
  for (const [ch] of CHAMP) for (const [ou] of OUV) {
    const a = meilleur(t,'A',ch,ou), b = meilleur(t,'B',ch,ou);
    if (!a || !b) continue;
    compte++; const ok = a.nom === b.nom; if (ok) pareil++;
    console.log(`    ${ch.padEnd(12)} ${ou.padEnd(17)}${(a.nom+' '+a.r.roi.toFixed(1)).padEnd(16)}` +
      `${(b.nom+' '+b.r.roi.toFixed(1)).padEnd(15)}${ok ? 'oui' : 'NON'}`);
  }
  console.log(`    → même instrument dans ${pareil} case(s) sur ${compte}.`);
  console.log(`      Le hasard seul en donnerait environ ${(compte/4).toFixed(1)}.\n`);
}
