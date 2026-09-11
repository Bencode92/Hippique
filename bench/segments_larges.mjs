/* « Et si on segmentait plus gros ? »
 *
 * L'hypothèse est raisonnable : les buckets à 13-19 courses ont produit des
 * formules absurdes. Avec des segments de plusieurs milliers de courses, la
 * recherche de formule a-t-elle de quoi capter quelque chose de réel ?
 *
 * PROTOCOLE, écrit avant de regarder :
 *   - univers  : premium (7 hippodromes), plat, 5 partants et plus
 *   - train    : 2022 → 31/12/2024        test : 01/01/2025 → aujourd'hui
 *   - segments : « tous », puis 4 larges (sprint/mile/middle/staying)
 *   - grille   : la cote (1/cote ou cote de référence) + jusqu'à 2 autres
 *                leviers, poids par pas de 0,1
 *   - critère  : top 1 sur le TEST, comparé au top 1 de la simple cote
 *   - verdict  : capte si le champion du train bat la cote sur le test,
 *                d'un écart supérieur à son erreur-type
 *
 * Tous les leviers sont construits chronologiquement, jamais avec le futur.
 */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const PREMIUM = ['LONGCHAMP','SAINTCLOUD','CHANTILLY','FONTAINEBLEAU','DEAUVILLE','LYONPARILLY'];
const COUPE = '2025-01-01';

const jk = new Map(), combo = new Map();
const tJkV = n => { const s = jk.get(n); return s && s.c >= 10 ? s.v/s.c : 0.08; };
const tJkP = n => { const s = jk.get(n); return s && s.c >= 10 ? s.p/s.c : 0.30; };
const tCombo = (j,e) => { const s = combo.get(j+'|'+e); return s && s.c >= 5 ? s.v/s.c : 0.08; };
const posMus = m => { const v = String(m||'').match(/\d+/g); return v ? v.map(Number).filter(x=>x>0&&x<25) : null; };
const moy = a => a.reduce((s,x)=>s+x,0)/a.length;

const NOMS = ['1/cote','cote ref','dérive','tauxV cheval','tauxP cheval','nb victoires',
              'gain moyen','tauxV jockey','tauxP jockey','combo jk-ent','musique','forme récente','âge','corde'];
const calc = p => [
  1/p.c,
  1/(p.cr > 1 ? p.cr : p.c),
  p.cr > 1 ? (p.cr - p.c)/p.cr : 0,
  p.nc >= 2 ? p.nv/p.nc : 0.08,
  p.nc >= 2 ? p.np/p.nc : 0.30,
  p.nv || 0,
  p.nc >= 1 ? (p.g||0)/p.nc : 0,
  tJkV(p.jk), tJkP(p.jk), tCombo(p.jk, p.en),
  (() => { const v = posMus(p.m); return v ? -moy(v) : -8; })(),
  (() => { const v = posMus(p.m); return v ? -moy(v.slice(0,3)) : -8; })(),
  -(p.ag || 4), -(p.co || 8),
];

const courses = [];
const brut = [];
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    if (d.spe === 'PLAT') brut.push(d);
  }
brut.sort((a,b)=>a.date.localeCompare(b.date));

for (const d of brut) {
  const prem = PREMIUM.some(x=>norm(d.hip).includes(x));
  const ps = (d.parts||[]).filter(p=>p.c>1);
  if (prem && ps.length >= 5 && ps.some(p=>p.a===1)) {
    const N = ps.length, M = new Float64Array(N * NOMS.length);
    ps.forEach((p,i) => { const v = calc(p); for (let k=0;k<NOMS.length;k++) M[i*NOMS.length+k] = v[k]; });
    // min-max par levier à l'intérieur de la course
    for (let k=0;k<NOMS.length;k++) {
      let lo=Infinity, hi=-Infinity;
      for (let i=0;i<N;i++) { const x=M[i*NOMS.length+k]; if(x<lo)lo=x; if(x>hi)hi=x; }
      const r = hi-lo || 1;
      for (let i=0;i<N;i++) M[i*NOMS.length+k] = (M[i*NOMS.length+k]-lo)/r;
    }
    const parCote = ps.map((p,i)=>i).sort((a,b)=>ps[a].c-ps[b].c);
    const rangGagnantMarche = parCote.indexOf(ps.findIndex(p=>p.a===1));
    courses.push({ date:d.date, dist:d.dist, N, M,
                   gagnant: ps.findIndex(p=>p.a===1), rangMarche: rangGagnantMarche });
  }
  for (const p of d.parts||[]) {
    const s = jk.get(p.jk) || {c:0,v:0,p:0}; s.c++; if(p.a===1)s.v++; if(p.a>=1&&p.a<=3)s.p++; jk.set(p.jk,s);
    const k = p.jk+'|'+p.en, t = combo.get(k) || {c:0,v:0}; t.c++; if(p.a===1)t.v++; combo.set(k,t);
  }
}

const SEG = { tous: ()=>true, sprint: d=>d<1400, mile: d=>d>=1400&&d<1700,
              middle: d=>d>=1700&&d<2200, staying: d=>d>=2200 };
const NL = NOMS.length;
// topK : le gagnant est-il dans les K premiers du classement ? K=1 pour le
// simple gagnant, K=2 pour un couplé, K=3 pour un trio. La question n'est pas
// la même : designer le gagnant est plus dur que le ranger dans les deux
// premiers, et les leviers pourraient aider davantage sur la seconde.
const topK = (set, lev, poids, K) => {
  let w = 0;
  for (const c of set) {
    const sc = new Float64Array(c.N);
    for (let i=0;i<c.N;i++) {
      let s = 0;
      for (let j=0;j<lev.length;j++) s += poids[j] * c.M[i*NL + lev[j]];
      sc[i] = s;
    }
    // rang du gagnant = nombre de chevaux mieux notés que lui
    let mieux = 0;
    for (let i=0;i<c.N;i++) if (i !== c.gagnant && sc[i] > sc[c.gagnant]) mieux++;
    if (mieux < K) w++;
  }
  return w / set.length;
};
const top1 = (set, lev, poids) => topK(set, lev, poids, 1);

console.log(`${courses.length} courses premium · train < ${COUPE} · test >=\n`);
const K = parseInt(process.argv[2]) || 1;
console.log(`CRITÈRE : le gagnant dans les ${K} premier${K>1?'s':''} du classement\n`);
console.log('  segment    train   test    champion trouvé sur le train                    modèle     cote     écart');
for (const [nom, f] of Object.entries(SEG)) {
  const tr = courses.filter(c=>f(c.dist) && c.date <  COUPE);
  const te = courses.filter(c=>f(c.dist) && c.date >= COUPE);
  if (tr.length < 200 || te.length < 200) { console.log(`  ${nom} — trop peu`); continue; }
  let meilleur = null;
  for (const base of [0, 1]) {                       // 1/cote ou cote de référence
    for (let a = -1; a < NL; a++) for (let b = a; b < NL; b++) {
      if (a === base || b === base) continue;
      const lev = [base].concat(a >= 0 ? [a] : []).concat(b > a && b >= 0 ? [b] : []);
      if (lev.length !== new Set(lev).size) continue;
      const pas = lev.length === 1 ? [[1]] : lev.length === 2
        ? [[.9,.1],[.8,.2],[.7,.3],[.6,.4],[.5,.5],[.4,.6],[.3,.7]]
        : [[.6,.2,.2],[.5,.3,.2],[.5,.2,.3],[.4,.3,.3],[.7,.2,.1],[.7,.1,.2],[.4,.4,.2],[.4,.2,.4]];
      for (const w of pas) {
        const t = topK(tr, lev, w, K);
        if (!meilleur || t > meilleur.t) meilleur = { lev, w, t };
      }
    }
  }
  const tt = topK(te, meilleur.lev, meilleur.w, K);
  const mc = te.filter(c=>c.rangMarche < K).length / te.length;
  const se = Math.sqrt(tt*(1-tt)/te.length) * 100;
  const d = 100*(tt - mc);
  const desc = meilleur.lev.map((l,i)=>`${NOMS[l]}×${meilleur.w[i]}`).join(' + ');
  console.log(`  ${nom.padEnd(10)}${String(tr.length).padStart(5)}${String(te.length).padStart(7)}   ${desc.padEnd(46)}` +
    `${(100*tt).toFixed(1)} %   ${(100*mc).toFixed(1)} %  ${(d>=0?'+':'')}${d.toFixed(1)} ± ${se.toFixed(1)}` +
    (d > se ? '  ← capte' : '  ← ne capte pas'));
}
