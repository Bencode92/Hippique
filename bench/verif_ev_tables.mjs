/* Deux tables pilotent les espérances affichées et elles se contredisent :
 *   ev_profils.json      : couplé en course fermée   -4,5 %
 *   ev_compositions.json : couplé rangs 1-2          -12,7 %
 * Huit points d'écart pour le même pari. ev_compositions n'a ni doc ni script
 * de génération dans le dépôt : on remesure tout depuis data/histo +
 * data/rapports, sur l'univers documenté par ev_profils. */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

const rap = new Map();
for (const f of fs.readdirSync('data/rapports').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/rapports/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    rap.set(`${d.date}|${norm(d.hip)}|${d.r}|${d.c}`, d.paris || {});
  }

// null = pari NON PROPOSÉ sur cette course. Le compter 0 reviendrait à le
// déclarer perdu, ce qui avait donné -48 % au 2 sur 4 : il n'est offert que
// sur une partie des courses. On exclut, on ne compte pas une perte.
const div = (paris, type, nums) => {
  const l = paris[type]; if (!l || !l.length) return null;
  const cle = nums.slice().sort((a,b)=>a-b).join('-');
  for (const x of l) if (String(x.comb).split('-').map(Number).sort((a,b)=>a-b).join('-') === cle) return x.div/100;
  return 0;   // pari proposé mais combinaison perdante
};

const acc = {};
const add = (k, g) => { if (g !== null) (acc[k] = acc[k] || []).push(g); };

for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe !== 'PLAT') continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 8) continue;                       // univers documenté
    const ov = ps.reduce((s,p)=>s+1/p.c,0);
    if (ov < 1.03 || ov > 1.60) continue;
    const paris = rap.get(`${d.date}|${norm(d.hip)}|${d.r}|${d.c}`);
    if (!paris) continue;
    const tri = ps.slice().sort((a,b)=>a.c-b.c);
    const pFav = (1/tri[0].c)/ov;
    const profil = pFav >= 0.28 ? 'fermee' : pFav >= 0.22 ? 'moyenne' : pFav >= 0.16 ? 'assez_ouverte' : 'ouverte';
    if (tri.length < 4) continue;
    const n = i => tri[i].n;

    // simple gagnant sur le favori
    add(`${profil}|simple`, div(paris,'E_SIMPLE_GAGNANT',[n(0)]));
    // couplé gagnant rangs 1-2
    add(`${profil}|couple01`, div(paris,'E_COUPLE_GAGNANT',[n(0),n(1)]));
    // trio rangs 1-2-3
    add(`${profil}|trio012`, div(paris,'E_TRIO',[n(0),n(1),n(2)]));
    // 2 sur 4 rangs 1-2
    add(`${profil}|d401`, div(paris,'E_DEUX_SUR_QUATRE',[n(0),n(1)]));
  }

const st = a => {
  const m = a.reduce((s,x)=>s+x,0)/a.length;
  const se = 100*Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length/a.length);
  return `${(100*(m-1)>=0?'+':'')}${(100*(m-1)).toFixed(1)} % ± ${se.toFixed(1)} (n=${String(a.length).padStart(4)})`;
};
console.log('REMESURE — favori et ses suivants, par profil d\'ouverture\n');
console.log('  profil            simple(1)            couplé(1-2)          trio(1-2-3)          2sur4(1-2)');
for (const p of ['fermee','moyenne','assez_ouverte','ouverte']) {
  const g = k => acc[`${p}|${k}`] ? st(acc[`${p}|${k}`]) : '—';
  console.log(`  ${p.padEnd(16)}${g('simple').padEnd(21)}${g('couple01').padEnd(21)}${g('trio012').padEnd(21)}${g('d401')}`);
}
console.log('\n  Pour comparaison, ce que la page affiche aujourd\'hui en course fermée :');
console.log('    ev_profils      simple -10,0 %   couplé  -4,5 %   trio -20,6 %   2sur4  -6,4 %');
console.log('    ev_compositions couplé rangs 1-2 : -12,7 %');
