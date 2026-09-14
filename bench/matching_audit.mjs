/* Audit du rattachement fiche PMU → classements France Galop, avec js/matching.js.
 *
 * Univers : data/courses, plat, hippodromes FR (hippos_filter.json), depuis le
 * 16/04/2026. Pour chaque course, le snapshot data/rankings le plus récent
 * ANTÉRIEUR OU ÉGAL à sa date (point-in-time). Classement de l'année d'abord,
 * celui de 2025 en repli (un cheval qui n'a pas encore couru en 2026 y est).
 *
 * Sort, par catégorie : la part rattachée, par méthode, et la liste des cas à
 * vérifier à la main (ambigus, famille seule, introuvables les plus fréquents).
 *
 *   node bench/matching_audit.mjs            # audit
 *   node bench/matching_audit.mjs --diff     # + désaccords avec le matcher du navigateur
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = require(path.join(ROOT, 'js', 'matching.js'));

const DEPUIS = '2026-04-16';
const FORMES_AUDIT = new Set(['SA', 'SAS', 'SASU', 'SARL', 'EARL', 'SCEA', 'SCA', 'SC', 'SNC', 'GAEC', 'EURL', 'STE', 'LTD', 'INC', 'LLC', 'CIE', 'CO']);
const DIFF = process.argv.includes('--diff');
const fr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hippos_filter.json'), 'utf8')).whitelist_fr;
const hippoFr = f => { const h = f.replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/\.json$/, '').replace(/_/g, '-'); return fr.some(w => h.startsWith(w)); };
const corresp = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/claude_correspondances.json'), 'utf8'));

function lireCSV(f) {
  if (!fs.existsSync(f)) return [];
  const lignes = fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim());
  const cols = lignes[0].split('\t');
  return lignes.slice(1).map(l => Object.fromEntries(l.split('\t').map((v, i) => [cols[i], v])));
}
const CATS = { jockeys: 'jockey', entraineurs: 'entraineur', chevaux: 'cheval', eleveurs: 'éleveurs', proprietaires: 'propriétaire' };
const SNAPS = fs.readdirSync(path.join(ROOT, 'data/rankings')).filter(d => /^\d{4}-\d{2}-\d{2}_/.test(d)).sort();
const cacheSnap = new Map();
function indexesPour(date) {
  let choisi = null;
  for (const s of SNAPS) if (s.slice(0, 10) <= date) choisi = s;
  if (!choisi) return null;
  if (cacheSnap.has(choisi)) return cacheSnap.get(choisi);
  const ix = {};
  for (const cat of Object.keys(CATS)) {
    const dir = path.join(ROOT, 'data/rankings', choisi);
    ix[cat] = M.creerIndex(lireCSV(path.join(dir, cat + '.csv')), cat, { correspondances: corresp.correspondances, etrangers: corresp.etrangers });
    ix[cat + '_2025'] = M.creerIndex(lireCSV(path.join(dir, cat + '_2025.csv')), cat, { correspondances: corresp.correspondances });
  }
  ix._snap = choisi;
  cacheSnap.set(choisi, ix);
  return ix;
}

// matcher du navigateur, pour le diff (il ne connaît que le dernier snapshot : data/<cat>.json)
let RL = null, dataNav = null;
if (DIFF) {
  global.window = {}; const log = console.log; console.log = () => {}; console.warn = () => {};
  eval(fs.readFileSync(path.join(ROOT, 'js/ranking-loader.js'), 'utf8')); RL = window.rankingLoader; console.log = log;
  dataNav = {};
  for (const cat of Object.keys(CATS)) { const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', cat + '.json'), 'utf8')); dataNav[cat] = d.resultats || d; }
}

const stats = {}, aVerifier = {}, introuvables = {}, desaccords = {};
for (const cat of Object.keys(CATS)) { stats[cat] = { total: 0, exact: 0, noyau: 0, manuel: 0, initiales: 0, tronque: 0, ambigu: 0, via2025: 0, null: 0, debutants: 0, horsPS: 0, attendus: 0 }; aVerifier[cat] = new Map(); introuvables[cat] = new Map(); desaccords[cat] = new Map(); }
let nCourses = 0, nPartants = 0, nDiff = 0;
const fichiers = fs.readdirSync(path.join(ROOT, 'data/courses')).filter(f => f.endsWith('.json') && f.slice(0, 10) >= DEPUIS && hippoFr(f)).sort();
for (const f of fichiers) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/courses', f), 'utf8'));
  if ((d.type_reunion || '').toLowerCase() !== 'plat') continue;
  const ix = indexesPour(f.slice(0, 10));
  if (!ix) continue;
  const dernierSnap = ix._snap === SNAPS[SNAPS.length - 1];
  for (const c of d.courses || []) {
    if ((c.type || 'Plat').toUpperCase() !== 'PLAT') continue;   // réunions mixtes : haies, steeple, attelé exclus
    const ps = c.participants || [];
    if (!ps.length) continue;
    nCourses++;
    for (const p of ps) {
      nPartants++;
      for (const [cat, champ] of Object.entries(CATS)) {
        const brut = p[champ];
        const s = stats[cat]; s.total++;
        if (!brut) { s.null++; continue; }
        let r = M.rattacher(ix[cat], brut, cat, { douteux: true }), via = '';
        if (!r) { r = M.rattacher(ix[cat + '_2025'], brut, cat, { douteux: true }); if (r) via = ' [2025]'; }
        if (r && r.methode === 'famille') {   // refusé par le module, montré ici pour contrôle
          const k = `${M.canon(brut)} ↛ ${r.nom}${via}  (famille seule, REFUSÉ)`; aVerifier[cat].set(k, (aVerifier[cat].get(k) || 0) + 1); r = null;
        }
        if (!r) {
          s.null++;
          const debutant = cat === 'chevaux' && !(+p.nb_courses > 0);
          const horsPS = cat === 'chevaux' && !/\s[HFM]\.(PU|PS)\./i.test(brut);   // AQPS, anglo-arabes, arabes : hors classement pur-sang
          if (debutant) s.debutants++; else if (horsPS) s.horsPS++;
          else { const k = M.canon(brut) + (cat === 'chevaux' ? ` (${p.nb_courses} c.)` : ''); introuvables[cat].set(k, (introuvables[cat].get(k) || 0) + 1); }
          if (debutant || horsPS) s.attendus++;
        } else {
          s[r.methode]++; if (via) s.via2025++;
          if (r.confiance < 95) { const k = `${M.canon(brut)} → ${r.nom}${via}  (${r.methode}${r.candidats ? ' : ' + r.candidats.join(' | ') : ''})`; aVerifier[cat].set(k, (aVerifier[cat].get(k) || 0) + 1); }
        }
        if (DIFF && dernierSnap) {
          nDiff++;
          const rn = RL.trouverItemDansClassement(dataNav[cat], brut, cat);
          const nomNav = rn ? M.canon(rn.Nom || rn.Cheval || rn.NomPostal || (rn.item && rn.item.Nom) || '') : null;
          const nomNouv = r && !via ? r.nom : null;
          if (nomNav !== nomNouv) { const k = `${M.canon(brut)}   nav: ${nomNav || '—'}   nouveau: ${nomNouv || (r ? r.nom + via : '—')}`; desaccords[cat].set(k, (desaccords[cat].get(k) || 0) + 1); }
        }
      }
    }
  }
}

const pct = (a, b) => (100 * a / b).toFixed(1).padStart(5) + ' %';
console.log('* rattachés = sur les partants qui PEUVENT être au classement (hors débutants et hors non pur-sang)');
console.log(`Courses FR plat depuis le ${DEPUIS} : ${nCourses} courses, ${nPartants} partants, ${SNAPS.length} snapshots\n`);
console.log('catégorie       rattachés*  exact   noyau  initiales  manuel | ambigu | dont 2025 | introuvables (dont débutants)');
for (const [cat, s] of Object.entries(stats)) {
  const ok = s.total - s.null;
  const base = s.total - s.attendus;   // hors débutants et hors pur-sang, qui ne PEUVENT pas être au classement
  console.log(`${cat.padEnd(15)} ${pct(ok, base)}   ${pct(s.exact, s.total)} ${pct(s.noyau, s.total)} ${pct(s.initiales, s.total)}  ${pct(s.manuel, s.total)} | ${pct(s.ambigu, s.total)} | ${pct(s.via2025, s.total)} | ${pct(s.null, s.total)}  (${s.null}${s.debutants ? ', débutants ' + s.debutants : ''}${s.horsPS ? ', hors pur-sang ' + s.horsPS : ''})`);
}
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
// Introuvables : le nom de famille existe-t-il quelque part dans le dernier classement ?
// Si non, c'est une absence réelle (jockey d'obstacle, cheval étranger…), pas un défaut du rattachement.
{
  const dernier = cacheSnap.get(SNAPS[SNAPS.length - 1]) || indexesPour(SNAPS[SNAPS.length - 1]);
  console.log('\nIntrouvables dont le nom de famille existe pourtant au classement (vrais échecs possibles) :');
  for (const cat of Object.keys(CATS)) {
    if (cat === 'chevaux') continue;
    const fam = new Set([...dernier[cat].parFamille.keys(), ...dernier[cat + '_2025'].parFamille.keys()]);
    let n = 0, ex = [];
    for (const [k, c] of introuvables[cat]) { const p = M.parsePersonne(k); const f = p.famille.filter(x => !FORMES_AUDIT.has(x)).join(' '); const last = p.famille[p.famille.length - 1]; if (fam.has(f) || fam.has(last)) { n += c; if (ex.length < 12) ex.push(`${k} (${c})`); } }
    console.log(`  ${cat.padEnd(14)} ${String(n).padStart(4)} / ${[...introuvables[cat].values()].reduce((a, b) => a + b, 0)}   ${ex.join(' ; ')}`);
  }
}
for (const cat of Object.keys(CATS)) {
  console.log(`\n── ${cat} : à vérifier (ambigu, ou famille seule refusée), ${aVerifier[cat].size} cas distincts`);
  for (const [k, n] of top(aVerifier[cat], 15)) console.log(`   ${String(n).padStart(4)}  ${k}`);
  console.log(`── ${cat} : introuvables les plus fréquents, ${introuvables[cat].size} noms distincts`);
  for (const [k, n] of top(introuvables[cat], 15)) console.log(`   ${String(n).padStart(4)}  ${k}`);
}
if (DIFF) {
  console.log(`\n═══ Désaccords avec le matcher du navigateur (sur ${nDiff} rattachements du dernier snapshot)`);
  for (const cat of Object.keys(CATS)) {
    const tot = [...desaccords[cat].values()].reduce((a, b) => a + b, 0);
    console.log(`\n── ${cat} : ${tot} désaccords, ${desaccords[cat].size} distincts`);
    for (const [k, n] of top(desaccords[cat], 25)) console.log(`   ${String(n).padStart(4)}  ${k}`);
  }
}
