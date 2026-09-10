/* Le favori que tu peux réellement miser n'est pas celui des mesures.
 *
 * Toutes les mesures d'ROI portent sur le favori FINAL — connu seulement après
 * la course. Un joueur choisit le favori du moment où il mise. Dans 24,5 % des
 * cas ce n'est pas le même cheval (bench/fraicheur_cotes.mjs).
 *
 * Nuance sur le protocole : en pari mutuel on ne peut PAS encaisser « la cote
 * de T-2 ». Le dividende se fixe à la clôture du pool. Le test correct est donc
 * : SÉLECTION au snapshot, PAIEMENT au dividende final. C'est ce qui est fait
 * ici — mesurer au prix de T-2 donnerait un ROI non réalisable. */
import fs from 'fs';
const norm = h => (h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const MOI = ['LONGCHAMP','PARISLONGCHAMP','SAINTCLOUD'];

const fin = new Map();
for (const f of fs.readdirSync('data/histo').filter(x=>x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/'+f,'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    fin.set(`${d.date}|${norm(d.hip)}|${d.r}|${d.c}`, d);
  }

const L = [];
for (const base of fs.readdirSync('data/cotes_live').filter(x=>x.endsWith('_live.json'))) {
  const d = JSON.parse(fs.readFileSync('data/cotes_live/'+base,'utf8'));
  const m = base.match(/_R(\d+)C(\d+)_live\.json$/); if (!m) continue;
  const hip = d.hippodrome || base.slice(11).replace(/_R\d+C\d+_live\.json$/,'');
  const ref = fin.get(`${base.slice(0,10)}|${norm(hip)}|${+m[1]}|${+m[2]}`);
  if (!ref || !(d.minutes_avant_depart > 0)) continue;

  const live = new Map();
  for (const p of d.participants||[]) if (p.cote_live > 1) live.set(p.numPmu, p.cote_live);
  const defi = new Map(), gagnant = new Map();
  for (const p of ref.parts||[]) { if (p.c > 1) defi.set(p.n, p.c); gagnant.set(p.n, p.a === 1); }
  const communs = [...live.keys()].filter(n=>defi.has(n));
  if (communs.length < 5) continue;

  const favLive  = communs.reduce((a,b)=>live.get(a)<=live.get(b)?a:b);
  const favFinal = communs.reduce((a,b)=>defi.get(a)<=defi.get(b)?a:b);
  L.push({
    minutes: d.minutes_avant_depart,
    chezMoi: MOI.some(h=>norm(hip).includes(h)),
    // sélection au snapshot, paiement au dividende final
    gainLive:  gagnant.get(favLive)  ? defi.get(favLive)  : 0,
    gainFinal: gagnant.get(favFinal) ? defi.get(favFinal) : 0,
    memeCheval: favLive === favFinal,
  });
}

const st = (a, k) => {
  if (a.length < 15) return null;
  const g = a.map(x=>x[k]);
  const m = g.reduce((s,x)=>s+x,0)/g.length;
  const se = 100*Math.sqrt(g.reduce((s,x)=>s+(x-m)*(x-m),0)/g.length/g.length);
  return { n:a.length, roi:100*(m-1), se };
};
const fmt = r => r ? `${r.roi>=0?'+':''}${r.roi.toFixed(1)} % ± ${r.se.toFixed(1)} (n=${String(r.n).padStart(3)})` : '  (trop peu)';

console.log(`${L.length} courses avec snapshot avant le départ (médiane T-${L.map(x=>x.minutes).sort((a,b)=>a-b)[L.length>>1]} min)\n`);
console.log('ROI SELON LE FAVORI RÉELLEMENT MISABLE  —  paiement au dividende final\n');
console.log('  univers                    favori du snapshot        favori final (irréalisable)   écart');
for (const [lib, sel] of [
  ['toutes courses         ', () => true],
  ['Longchamp + St-Cloud   ', x => x.chezMoi],
  ['ailleurs               ', x => !x.chezMoi],
]) {
  const a = L.filter(sel);
  const rl = st(a,'gainLive'), rf = st(a,'gainFinal');
  const ec = (rl && rf) ? `${(rl.roi-rf.roi)>=0?'+':''}${(rl.roi-rf.roi).toFixed(1)} pt` : '—';
  console.log('  '+lib+fmt(rl).padEnd(26)+fmt(rf).padEnd(30)+ec);
}
const chg = L.filter(x=>!x.memeCheval).length;
console.log(`\n  favori du snapshot ≠ favori final : ${chg}/${L.length} (${(100*chg/L.length).toFixed(1)} %)`);

// ── Test APPARIÉ ────────────────────────────────────────────────────────
// Comparer deux ROI indépendants gaspille toute l'information : ce sont les
// mêmes courses, et l'écart est nul dans 76 % des cas. La différence par
// course a une variance bien plus faible, donc bien plus de puissance.
const diff = L.map(x => x.gainLive - x.gainFinal);
const par = (a, lib) => {
  if (a.length < 15) return console.log(`  ${lib} — trop peu (n=${a.length})`);
  const m = a.reduce((s,x)=>s+x,0)/a.length;
  const se = Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/a.length/a.length);
  const t = se ? m/se : 0;
  console.log(`  ${lib.padEnd(24)}${(100*m>=0?'+':'')}${(100*m).toFixed(1)} pt ± ${(100*se).toFixed(1)}   t = ${t.toFixed(2)}   (n=${a.length}, dont ${a.filter(x=>x!==0).length} non nuls)`);
};
console.log('\nCOÛT DU DÉCALAGE, mesuré en apparié (favori du snapshot − favori final)');
par(diff, 'toutes courses');
par(L.filter(x=>x.chezMoi).map(x=>x.gainLive-x.gainFinal), 'Longchamp + St-Cloud');
par(L.filter(x=>!x.chezMoi).map(x=>x.gainLive-x.gainFinal), 'ailleurs');

// puissance : combien de courses pour trancher 2 points ?
const sd = Math.sqrt(diff.reduce((s,x)=>s+(x-diff.reduce((a,b)=>a+b,0)/diff.length)**2,0)/diff.length);
const nreq = Math.ceil(Math.pow(1.96*sd/0.02, 2));
console.log(`\n  écart-type de la différence : ${(100*sd).toFixed(1)} pt par course`);
console.log(`  courses nécessaires pour trancher un écart de 2 pt à 95 % : ${nreq.toLocaleString('fr-FR')}`);
console.log(`  au rythme actuel de capture (~2 par jour exploitables) : ${Math.round(nreq/2/365)} ans`);

// ── Voie déterministe ───────────────────────────────────────────────────
// Le ROI demande 22 852 courses parce qu'il attend des victoires. L'ESPÉRANCE,
// elle, se calcule course par course sans résultat : p(cheval) × sa cote. En
// misant le favori du snapshot on achète un cheval dont on connaît la cote
// finale et la probabilité implicite. L'écart d'espérance est donc mesurable
// sur les 104 courses, sans bruit d'échantillonnage sur les victoires.
import { createRequire } from 'module';
const PP = createRequire(import.meta.url)('../js/panneau-paris.js');

const ev = [];
for (const base of fs.readdirSync('data/cotes_live').filter(x=>x.endsWith('_live.json'))) {
  const d = JSON.parse(fs.readFileSync('data/cotes_live/'+base,'utf8'));
  const m = base.match(/_R(\d+)C(\d+)_live\.json$/); if (!m) continue;
  const hip = d.hippodrome || base.slice(11).replace(/_R\d+C\d+_live\.json$/,'');
  const ref = fin.get(`${base.slice(0,10)}|${norm(hip)}|${+m[1]}|${+m[2]}`);
  if (!ref || !(d.minutes_avant_depart > 0)) continue;
  const live = new Map(), defi = new Map();
  for (const p of d.participants||[]) if (p.cote_live > 1) live.set(p.numPmu, p.cote_live);
  for (const p of ref.parts||[]) if (p.c > 1) defi.set(p.n, p.c);
  const communs = [...live.keys()].filter(n=>defi.has(n));
  if (communs.length < 5) continue;

  // probabilités finales, corrigées du biais favori/outsider, sur le champ commun
  const tri = communs.slice().sort((a,b)=>defi.get(a)-defi.get(b));
  const P = PP.probabilites(tri.map(n=>({cote:defi.get(n)})));
  const pDe = new Map(tri.map((n,i)=>[n,P[i]]));

  const favLive  = communs.reduce((a,b)=>live.get(a)<=live.get(b)?a:b);
  const favFinal = tri[0];
  ev.push({
    chezMoi: MOI.some(h=>norm(hip).includes(h)),
    evLive:  pDe.get(favLive)  * defi.get(favLive)  - 1,
    evFinal: pDe.get(favFinal) * defi.get(favFinal) - 1,
  });
}
const bilan = (a, lib) => {
  if (!a.length) return;
  const dl = a.reduce((s,x)=>s+x.evLive,0)/a.length;
  const df = a.reduce((s,x)=>s+x.evFinal,0)/a.length;
  const d  = a.map(x=>x.evLive-x.evFinal);
  const md = d.reduce((s,x)=>s+x,0)/d.length;
  const se = Math.sqrt(d.reduce((s,x)=>s+(x-md)*(x-md),0)/d.length/d.length);
  console.log(`  ${lib.padEnd(24)}espérance ${(100*dl).toFixed(1)} % (misable) vs ${(100*df).toFixed(1)} % (favori final)`
    + `   →  ${(100*md>=0?'+':'')}${(100*md).toFixed(2)} pt ± ${(100*se).toFixed(2)}   t = ${(se?md/se:0).toFixed(1)}`);
};
console.log('\nCOÛT DU DÉCALAGE, mesuré en ESPÉRANCE (déterministe, sans attendre les victoires)');
bilan(ev, 'toutes courses');
bilan(ev.filter(x=>x.chezMoi), 'Longchamp + St-Cloud');
bilan(ev.filter(x=>!x.chezMoi), 'ailleurs');
