/* Le chargement parallèle produit-il EXACTEMENT le même résultat que le
 * séquentiel ?
 *
 * Trois tentatives de parallélisation ont été annulées faute de cette
 * vérification. On rejoue ici les deux versions du VRAI code d'index.html sur
 * les mêmes fichiers, et on compare le courseData produit, sérialisé.
 *
 *     node bench/bench-parallele.mjs
 */
import fs from 'fs';

const extraireObjet = (src, ancre) => {
  const i = src.indexOf(ancre);
  if (i < 0) throw new Error('ancre introuvable : ' + ancre);
  let d = 0, j = src.indexOf('{', i), f = j;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { if (!--d) { f = k; break; } }
  }
  return src.slice(j, f + 1);
};

// on rejoue processFile telle quelle, avec un fetchFile qui lit le disque
async function charger(src, parallele, fichiers) {
  const corps = extraireObjet(src, 'async processFile(file, courseData, preloaded)');
  const pf = new Function('return async function processFile(file, courseData, preloaded) ' + corps + ';')();
  const loader = {
    processFile: pf,
    async fetchFile(file) {
      return JSON.parse(fs.readFileSync('data/courses/' + file.name, 'utf8'));
    },
  };
  const courseData = {};
  if (!parallele) {
    for (const f of fichiers) await loader.processFile.call(loader, f, courseData, await loader.fetchFile(f));
  } else {
    const charges = new Array(fichiers.length).fill(null);
    let cur = 0;
    await Promise.all(Array.from({ length: Math.min(8, fichiers.length) }, async () => {
      for (;;) { const i = cur++; if (i >= fichiers.length) return; charges[i] = await loader.fetchFile(fichiers[i]); }
    }));
    for (let i = 0; i < fichiers.length; i++) if (charges[i]) await loader.processFile.call(loader, fichiers[i], courseData, charges[i]);
  }
  return courseData;
}

const src = fs.readFileSync('index.html', 'utf8');
global.console = { ...console, log: () => {} };   // le front logue par fichier

const tous = fs.readdirSync('data/courses').filter(x => /^\d{4}-\d{2}-\d{2}_/.test(x));
const parJour = {};
for (const f of tous) (parJour[f.slice(0, 10)] = parJour[f.slice(0, 10)] || []).push({ name: f, download_url: f });
const jours = Object.keys(parJour).sort().slice(-12);

let ok = 0, ko = 0;
for (const j of jours) {
  const fichiers = parJour[j];
  const a = await charger(src, false, fichiers);
  const b = await charger(src, true,  fichiers);
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  const identique = sa === sb;
  identique ? ok++ : ko++;
  const nh = Object.keys(a).length;
  const nc = Object.values(a).reduce((s, x) => s + x.length, 0);
  console.error(`  ${j}  ${String(fichiers.length).padStart(2)} fichiers → ${nh} hippodrome(s), ${String(nc).padStart(3)} courses   ` +
    (identique ? 'IDENTIQUE' : `DIFFÉRENT (${sa.length} vs ${sb.length} octets)`));
}
console.error(`\n  ${ok} journée(s) identiques, ${ko} différente(s)`);
// ── Gain attendu ────────────────────────────────────────────────────────
// Le gain est réseau, pas CPU : on simule la latence d'un aller-retour vers
// raw.githubusercontent depuis la France.
const LATENCE = 140;   // ms par fichier, mesure typique
console.error(`\nGAIN ATTENDU (latence simulée ${LATENCE} ms par fichier, pool de 8)\n`);
console.error('  journée      fichiers   séquentiel   parallèle   gain');
let totS = 0, totP = 0;
for (const j of jours) {
  const n = parJour[j].length;
  const seq = n * LATENCE;
  const par = Math.ceil(n / 8) * LATENCE;
  totS += seq; totP += par;
  console.error(`  ${j}   ${String(n).padStart(6)}   ${String(seq).padStart(8)} ms ${String(par).padStart(9)} ms   ×${(seq/par).toFixed(1)}`);
}
console.error(`\n  sur ces ${jours.length} journées : ${(totS/1000).toFixed(1)} s → ${(totP/1000).toFixed(1)} s   ` +
  `(×${(totS/totP).toFixed(1)}, ${((totS-totP)/jours.length/1000).toFixed(1)} s gagnées par journée ouverte)`);

process.exit(ko ? 1 : 0);
