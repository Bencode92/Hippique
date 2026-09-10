/* De combien la cote bouge-t-elle entre le dernier snapshot live et le départ,
 * et sur quelle fraction de courses cela change-t-il le verdict affiché ?
 *
 * On n'y réimplémente RIEN : verdictCourse() est extraite telle quelle
 * d'index.html et PanneauParis chargé depuis js/, pour que la mesure porte
 * sur le code réellement servi.  */
import fs from 'fs';
import { createRequire } from 'module';
global.PanneauParis = createRequire(import.meta.url)('../js/panneau-paris.js');

const src = fs.readFileSync('index.html', 'utf8');
const extrait = n => {
  const i = src.indexOf('function ' + n);
  let d = 0, j = src.indexOf('{', i), f = j;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { if (!--d) { f = k; break; } } }
  return src.slice(i, f + 1);
};
// eval() en module ESM ne publie pas le binding : on construit la fonction.
const verdictCourse = new Function('PanneauParis',
  extrait('verdictCourse') + '\nreturn verdictCourse;')(global.PanneauParis);

const norm = h => (h || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const MOI = ['LONGCHAMP', 'PARISLONGCHAMP', 'SAINTCLOUD'];

// cotes définitives
const fin = new Map();
for (const f of fs.readdirSync('data/histo').filter(x => x.endsWith('.jsonl')))
  for (const l of fs.readFileSync('data/histo/' + f, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    const d = JSON.parse(l);
    fin.set(`${d.date}|${norm(d.hip)}|${d.r}|${d.c}`, d);
  }

const lignes = [];
let orphelins = 0, apresDepart = 0;
for (const base of fs.readdirSync('data/cotes_live').filter(x => x.endsWith('_live.json'))) {
  const d = JSON.parse(fs.readFileSync('data/cotes_live/' + base, 'utf8'));
  const date = base.slice(0, 10);
  const m = base.match(/_R(\d+)C(\d+)_live\.json$/);
  if (!m) continue;
  const hip = d.hippodrome || base.slice(11).replace(/_R\d+C\d+_live\.json$/, '');
  const ref = fin.get(`${date}|${norm(hip)}|${+m[1]}|${+m[2]}`);
  if (!ref) { orphelins++; continue; }
  // un snapshot postérieur au départ ne mesure plus un décalage
  if (!(d.minutes_avant_depart > 0)) { apresDepart++; continue; }

  const live = new Map(), defi = new Map();
  for (const p of d.participants || []) if (p.cote_live > 1) live.set(p.numPmu, p.cote_live);
  for (const p of ref.parts || []) if (p.c > 1) defi.set(p.n, p.c);
  const communs = [...live.keys()].filter(n => defi.has(n));
  if (communs.length < 5) continue;

  const vL = verdictCourse(hip, communs.map(n => ({ cote: live.get(n) })));
  const vF = verdictCourse(hip, communs.map(n => ({ cote: defi.get(n) })));
  if (!vL || !vF || vL.etat === 'incomplet' || vF.etat === 'incomplet') continue;

  const favL = communs.reduce((a, b) => live.get(a) <= live.get(b) ? a : b);
  const favF = communs.reduce((a, b) => defi.get(a) <= defi.get(b) ? a : b);
  lignes.push({
    hip, minutes: d.minutes_avant_depart,
    derive: (defi.get(favL) - live.get(favL)) / live.get(favL),
    memeFavori: favL === favF,
    jL: vL.etat === 'jouable', jF: vF.etat === 'jouable',
    ecartEv: Math.abs(vF.ev - vL.ev),
    chezMoi: MOI.some(h => norm(hip).includes(h)),
  });
}

const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
console.log(`${lignes.length} courses appariées  (${orphelins} sans résultat définitif, ${apresDepart} snapshots pris après le départ)\n`);
const mins = lignes.map(l => l.minutes).sort((a, b) => a - b);
console.log(`Snapshot médian à T-${q(mins, .5)} min  (de T-${mins[0]} à T-${mins[mins.length - 1]})\n`);

const der = lignes.map(l => Math.abs(l.derive)).sort((a, b) => a - b);
console.log('DÉRIVE de la cote du favori entre snapshot et départ');
console.log(`  médiane ${(100*q(der,.5)).toFixed(1)} %   p75 ${(100*q(der,.75)).toFixed(1)} %   p90 ${(100*q(der,.90)).toFixed(1)} %`);
const chg = lignes.filter(l => !l.memeFavori).length;
console.log(`  le favori affiché n'est plus le favori au départ : ${chg}/${lignes.length} (${(100*chg/lignes.length).toFixed(1)} %)\n`);

// intervalle de Wilson : avec n petit, la proportion brute ne suffit pas
const wilson = (k, n) => {
  if (!n) return [0, 0];
  const p = k / n, z = 1.96, d = 1 + z*z/n;
  const c = (p + z*z/(2*n)) / d, h = z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n)) / d;
  return [Math.max(0, c-h), Math.min(1, c+h)];
};
const bascule = (sous, lib) => {
  const n = sous.length;
  if (!n) return console.log(`${lib}\n  (aucune course)`);
  const b = sous.filter(l => l.jL !== l.jF);
  const fp = b.filter(l => l.jL && !l.jF).length;
  const [lo, hi] = wilson(b.length, n);
  console.log(lib);
  console.log(`  verdict changé sur ${b.length}/${n} courses = ${(100*b.length/n).toFixed(1)} %  [IC95 ${(100*lo).toFixed(1)} – ${(100*hi).toFixed(1)} %]`);
  console.log(`    JOUABLE affiché mais faux au départ : ${fp}   PASS affiché mais jouable : ${b.length - fp}`);
};
bascule(lignes, 'BASCULE DE VERDICT — toutes courses');
console.log();
bascule(lignes.filter(l => l.chezMoi), 'BASCULE DE VERDICT — Longchamp + Saint-Cloud');

const ec = lignes.map(l => l.ecartEv).sort((a, b) => a - b);
console.log(`\nÉcart d'espérance dû au décalage : médiane ${(100*q(ec,.5)).toFixed(1)} pt, p90 ${(100*q(ec,.9)).toFixed(1)} pt`);

// ── Contrôles : le snapshot vaut-il mieux que la cote du matin, et la dérive
//    s'effondre-t-elle quand on approche du départ ? C'est ce qui dit si un
//    accès temps réel (proxy) gagnerait quelque chose sur un cron plus serré.
const parRef = [];
for (const base of fs.readdirSync('data/cotes_live').filter(x => x.endsWith('_live.json'))) {
  const d = JSON.parse(fs.readFileSync('data/cotes_live/' + base, 'utf8'));
  const m = base.match(/_R(\d+)C(\d+)_live\.json$/); if (!m) continue;
  const hip = d.hippodrome || base.slice(11).replace(/_R\d+C\d+_live\.json$/, '');
  const ref = fin.get(`${base.slice(0,10)}|${norm(hip)}|${+m[1]}|${+m[2]}`);
  if (!ref || !(d.minutes_avant_depart > 0)) continue;
  const defi = new Map(), matin = new Map();
  for (const p of ref.parts || []) { if (p.c > 1) defi.set(p.n, p.c); if (p.cr > 1) matin.set(p.n, p.cr); }
  for (const p of d.participants || []) {
    if (!(p.cote_live > 1) || !defi.has(p.numPmu)) continue;
    parRef.push({ min: d.minutes_avant_depart,
      dLive: Math.abs(defi.get(p.numPmu) - p.cote_live) / p.cote_live,
      dMatin: matin.has(p.numPmu) ? Math.abs(defi.get(p.numPmu) - matin.get(p.numPmu)) / matin.get(p.numPmu) : null });
  }
}
const med = a => { const s = a.slice().sort((x,y)=>x-y); return s.length ? s[s.length>>1] : NaN; };
console.log(`\nDÉRIVE MÉDIANE jusqu'au départ, tous chevaux (n=${parRef.length})`);
console.log(`  depuis la cote du matin (cr) : ${(100*med(parRef.filter(x=>x.dMatin!=null).map(x=>x.dMatin))).toFixed(1)} %`);
console.log(`  depuis le snapshot live      : ${(100*med(parRef.map(x=>x.dLive))).toFixed(1)} %`);
console.log(`\nDÉRIVE RÉSIDUELLE selon l'instant du snapshot`);
for (const [lo, hi] of [[1,3],[4,6],[7,9],[10,12],[13,15]]) {
  const s = parRef.filter(x => x.min >= lo && x.min <= hi);
  if (s.length < 20) continue;
  console.log(`  T-${lo} à T-${hi} min : ${(100*med(s.map(x=>x.dLive))).toFixed(1)} %   (n=${s.length})`);
}
