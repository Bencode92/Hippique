/* Précalcule tout ce que la carte doit afficher, pour une journée → data/jour/<date>.json
 *
 * Mesuré le 04/10/2026 : la page télécharge 13,3 Mo sur 74 requêtes avant
 * d'afficher une course — propriétaires pondérés 2,7 Mo, éleveurs 1,9, chevaux
 * 1,6, forme récente 1,6… tout ça uniquement pour écrire six rangs par cheval
 * dans la colonne Rattach. et une pastille à côté du jockey. Sur le réseau d'un
 * hippodrome, c'est une minute d'attente juste avant de miser.
 *
 * Ici, le rattachement et les pastilles sont résolus une fois pour toutes,
 * côté dépôt, avec le snapshot daté (strictement antérieur à la course) et
 * js/matching.js. La carte n'a plus qu'un fichier de quelques dizaines de Ko.
 *
 *     node bench/precalcul_jour.mjs            # aujourd'hui
 *     node bench/precalcul_jour.mjs 2026-10-03 # une date
 *     node bench/precalcul_jour.mjs --tout     # toutes les journées présentes
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = require(path.join(ROOT, 'js', 'matching.js'));

const corresp = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/claude_correspondances.json'), 'utf8'));
const jkDist = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/jockeys_distance.json'), 'utf8'));
// forme récente : 2,3 Mo de fichiers pour deux flèches par ligne — on en extrait
// la seule tendance, par cheval et par jockey.
const lireForme = f => { try { return (JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')).resultats) || {}; } catch { return {}; } };
const formeCh = lireForme('chevaux_forme_recente.json'), formeJk = lireForme('jockeys_forme_recente.json');
const nomCheval = t => M.parseCheval(t).nom;
const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.\-]/g, '')); return isFinite(x) ? x : 0; };

function lireCSV(f) {
  if (!fs.existsSync(f)) return [];
  const L = fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim());
  const cols = L[0].split('\t');
  return L.slice(1).map((l, i) => { const r = Object.fromEntries(l.split('\t').map((v, j) => [cols[j], v])); r.Rang = i + 1; return r; });
}
const CATS = { chevaux: 'cheval', jockeys: 'jockey', entraineurs: 'entraineur', eleveurs: 'éleveurs', proprietaires: 'propriétaire', cravache_or: 'jockey' };
const COURT = { chevaux: 'ch', jockeys: 'jk', entraineurs: 'ent', eleveurs: 'el', proprietaires: 'pr', cravache_or: 'cr' };
const SNAPS = fs.readdirSync(path.join(ROOT, 'data/rankings')).filter(d => /^\d{4}-\d{2}-\d{2}_/.test(d)).sort();
const cache = new Map();
function indexes(date) {
  let choisi = null;
  for (const s of SNAPS) if (s.slice(0, 10) < date) choisi = s;   // strictement antérieur
  if (!choisi) return null;
  if (cache.has(choisi)) return cache.get(choisi);
  const dir = path.join(ROOT, 'data/rankings', choisi), ix = { _snap: choisi };
  for (const cat of Object.keys(CATS)) {
    const fichier = cat === 'cravache_or' ? 'cravache_or' : cat;
    const idxCat = cat === 'cravache_or' ? 'jockeys' : cat;
    ix[cat] = M.creerIndex(lireCSV(path.join(dir, fichier + '.csv')), idxCat, { correspondances: corresp.correspondances });
    ix[cat + '25'] = M.creerIndex(lireCSV(path.join(dir, fichier + '_2025.csv')), idxCat, { correspondances: corresp.correspondances });
  }
  cache.set(choisi, ix);
  return ix;
}

// pastille : même logique que la carte (belle course par longueur, sinon distance)
const cleNom = t => String(t || '').toUpperCase().replace(/[^A-Z]/g, '');
function pastille(jockey, distance, nomCourse) {
  const jk = String(jockey || '').toUpperCase().trim();
  if (!jk) return null;
  const c = cleNom(nomCourse);
  const belle = c.length >= 12 && (jkDist.noms_belles_courses || []).some(n => n.length >= 12 && (c.includes(n) || n.includes(c)));
  if (belle) {
    const bande = String(Math.round(distance / 100) * 100);
    const bd = jkDist.belles_par_distance && jkDist.belles_par_distance.bandes[bande];
    const cd = bd && bd.classement.find(x => x.jk === jk);
    if (cd && cd.rang <= 5) return { type: 'groupe_dist', bande, total: bd.jockeys, ...cd };
    const B = jkDist.belles_courses;
    const cg = B && B.classement.find(x => x.jk === jk);
    if (cg && cg.rang <= 8) return { type: 'groupe', total: B.jockeys, ...cg };
    return null;
  }
  if (!distance) return null;
  const bande = String(Math.round(distance / 100) * 100);
  const b = jkDist.bandes && jkDist.bandes[bande];
  const cc = b && b.classement.find(x => x.jk === jk);
  if (cc && cc.rang <= 5) return { type: 'distance', bande, total: b.jockeys, ...cc };
  return null;
}

function journee(date) {
  const fichiers = fs.readdirSync(path.join(ROOT, 'data/courses')).filter(f => f.startsWith(date + '_') && f.endsWith('.json'));
  if (!fichiers.length) return null;
  const ix = indexes(date);
  const out = { date, genere: new Date().toISOString(), snapshot: ix ? ix._snap : null, hippodromes: {} };
  let nP = 0, nR = 0;
  for (const f of fichiers.sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/courses', f), 'utf8'));
    const hip = d.hippodrome || f.replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/\.json$/, '');
    const courses = [];
    for (const c of d.courses || []) {
      const dist = num(c.distance);
      const parts = (c.participants || []).map(p => {
        const o = { n: p['n°'] || p.numero || p.n };
        if (ix) {
          const r = {};
          for (const [cat, champ] of Object.entries(CATS)) {
            const nom = p[champ] || (champ === 'entraineur' ? p['entraîneur'] : '');
            if (!nom) continue;
            const idxCat = cat === 'cravache_or' ? 'jockeys' : cat;
            let m = M.rattacher(ix[cat], nom, idxCat), an = '';
            if (!m) { m = M.rattacher(ix[cat + '25'], nom, idxCat); if (m) an = '25'; }
            if (m) r[COURT[cat]] = { r: +m.item.Rang || null, nom: m.nom, ...(an ? { a: 25 } : {}) };
          }
          o.rangs = r;
        }
        const pa = pastille(p.jockey, dist, c.nom);
        if (pa) o.pastille = pa;
        const fc = formeCh[nomCheval(p.cheval)], fj = formeJk[String(p.jockey || '').toUpperCase().trim()];
        if (fc?.tendance || fj?.tendance) o.forme = { ...(fc?.tendance ? { ch: fc.tendance } : {}), ...(fj?.tendance ? { jk: fj.tendance } : {}) };
        nP++;
        return o;
      });
      courses.push({ numero: c.numero, nom: c.nom, distance: dist, partants: parts });
      nR++;
    }
    out.hippodromes[hip] = courses;
  }
  fs.mkdirSync(path.join(ROOT, 'data/jour'), { recursive: true });
  const chemin = path.join(ROOT, 'data/jour', date + '.json');
  fs.writeFileSync(chemin, JSON.stringify(out));
  return { chemin, nR, nP, ko: Math.round(fs.statSync(chemin).size / 1024), snap: out.snapshot };
}

const arg = process.argv[2];
const dates = arg === '--tout'
  ? [...new Set(fs.readdirSync(path.join(ROOT, 'data/courses')).filter(f => /^\d{4}-\d{2}-\d{2}_/.test(f)).map(f => f.slice(0, 10)))].sort()
  : [arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : new Date().toISOString().slice(0, 10)];
for (const d of dates) {
  const r = journee(d);
  if (r) console.log(`${d} · ${r.nR} courses · ${r.nP} partants · ${r.ko} Ko · snapshot ${r.snap}`);
  else if (dates.length === 1) console.log(`${d} : aucune course`);
}
