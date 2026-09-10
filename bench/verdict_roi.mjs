/* Le badge JOUABLE prétend trier les courses. Apporte-t-il quelque chose par
 * rapport à « je joue tous les favoris chez moi » ?
 *
 * ATTENTION à la circularité : l'offset +0,124 du verdict a été estimé sur ces
 * mêmes courses. Le filtre est donc avantagé par construction ; on découpe par
 * période pour voir ce qu'il reste hors de l'échantillon d'estimation. */
import fs from 'fs'; import { createRequire } from 'module';
global.PanneauParis = createRequire(import.meta.url)('../js/panneau-paris.js');
const src = fs.readFileSync('index.html', 'utf8');
const ext = n => { const i = src.indexOf('function '+n); let d=0,j=src.indexOf('{',i),f=j;
  for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){if(!--d){f=k;break;}}} return src.slice(i,f+1); };
const verdictCourse = new Function('PanneauParis', ext('verdictCourse')+'\nreturn verdictCourse;')(global.PanneauParis);

const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const MOI = ['LONGCHAMP','PARISLONGCHAMP','SAINTCLOUD'];
const par = {};
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe !== 'PLAT' || !MOI.some(m=>norm(d.hip).includes(m))) continue;
    const ps = (d.parts||[]).filter(p=>p.c>1);
    if (ps.length < 5) continue;
    const v = verdictCourse(d.hip, ps.map(p=>({cote:p.c})));
    if (!v || v.etat === 'incomplet') continue;
    const fav = ps.reduce((a,b)=>a.c<=b.c?a:b);
    const an = d.date.slice(0,4);
    (par[an] = par[an] || []).push({ jouable: v.etat==='jouable', cote: fav.c, gagne: fav.a === 1 });
  }

const roi = a => { if(!a.length) return null;
  const g = a.reduce((s,x)=>s+(x.gagne?x.cote:0),0);
  const se = 100*Math.sqrt(a.reduce((s,x)=>s+Math.pow((x.gagne?x.cote:0)-g/a.length,2),0)/a.length/a.length)/1;
  return { n:a.length, roi:100*(g/a.length-1), se }; };
const fmt = r => r ? `${r.roi>=0?'+':''}${r.roi.toFixed(1)} % ± ${r.se.toFixed(1)}  (n=${r.n})` : '—';

console.log('ROI du FAVORI en simple gagnant, à Longchamp et Saint-Cloud\n');
console.log('  année   tous les favoris              seulement si JOUABLE          % jouables');
let tA=[], tJ=[];
for (const an of Object.keys(par).sort()) {
  const a = par[an], j = a.filter(x=>x.jouable);
  tA = tA.concat(a); tJ = tJ.concat(j);
  console.log(`  ${an}    ${fmt(roi(a)).padEnd(28)}  ${fmt(roi(j)).padEnd(28)}  ${(100*j.length/a.length).toFixed(0)} %`);
}
console.log(`\n  TOTAL   ${fmt(roi(tA)).padEnd(28)}  ${fmt(roi(tJ)).padEnd(28)}  ${(100*tJ.length/tA.length).toFixed(0)} %`);
const ecarte = tA.filter(x=>!x.jouable);
console.log(`\n  Ce que le filtre écarte : ${fmt(roi(ecarte))}`);
