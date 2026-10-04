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
// Un dossier de snapshot ne compte que s'il porte les CSV attendus : un autre
// workflow (pipeline-complet) y dépose aussi des .json, et le retenir vidait
// tous les rattachements sans rien signaler.
const estSnapCSV = d => fs.existsSync(path.join(ROOT, 'data/rankings', d, 'jockeys.csv'));
const SNAPS = fs.readdirSync(path.join(ROOT, 'data/rankings')).filter(d => /^\d{4}-\d{2}-\d{2}_/.test(d) && estSnapCSV(d)).sort();
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

// Dernier relevé de cotes de chaque course (data/cotes_live), plus celui de la
// fenêtre du protocole [T-2:40 ; T-1:20] : la carte n'a ainsi qu'UN fichier à
// lire, et le JSON du jour se consulte tel quel sur GitHub avant la course.
function cotesLive(date) {
    const par = new Map();
    let dir;
    try { dir = fs.readdirSync(path.join(ROOT, 'data/cotes_live')); } catch { return par; }
    for (const f of dir.filter(x => x.startsWith(date + '_') && x.endsWith('_live.json'))) {
        const m = f.match(/^(\d{4}-\d{2}-\d{2})_(.+)_R(\d+)C(\d+)_live\.json$/);
        if (!m) continue;
        try {
            const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cotes_live', f), 'utf8'));
            const dep = d.heure_depart || null;
            const rel = d.releves || [];
            const sec = r => dep && r.scraped_at ? Math.round((dep - new Date(r.scraped_at).getTime()) / 1000) : null;
            let dernier = null, fenetre = null;
            for (const r of rel) {
                const sv = sec(r);
                if (sv === null) continue;
                if (sv > 0 && (!dernier || sv < dernier.sec)) dernier = { sec: sv, cotes: r.cotes, t: r.scraped_at };
                if (sv >= 80 && sv <= 160 && (!fenetre || Math.abs(sv - 120) < Math.abs(fenetre.sec - 120))) fenetre = { sec: sv, cotes: r.cotes, t: r.scraped_at };
            }
            const base = Object.fromEntries((d.participants || []).map(p => [String(p.numPmu), { c: p.cote_live, ref: p.cote_reference, t: p.tendance }]));
            par.set(`${normH(m[2])}|${+m[4]}`, { depart: dep, dernier, fenetre, base });
        } catch {}
    }
    return par;
}
const normH = t => String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');

function journee(date) {
  const fichiers = fs.readdirSync(path.join(ROOT, 'data/courses')).filter(f => f.startsWith(date + '_') && f.endsWith('.json'));
  if (!fichiers.length) return null;
  const ix = indexes(date);
  const live = cotesLive(date);
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
      const lv = live.get(`${normH(hip)}|${num(c.numero)}`);
      if (lv) {
        // cote du dernier relevé et cote du relevé T-2 (celui qui fait foi pour le test)
        for (const p of parts) {
          const d1 = lv.dernier && lv.dernier.cotes[String(p.n)], d2 = lv.fenetre && lv.fenetre.cotes[String(p.n)];
          const b = lv.base[String(p.n)];
          if (d1 || d2 || b) p.cotes = { ...(d1 ? { live: d1 } : {}), ...(d2 ? { t2: d2 } : {}), ...(b && b.ref ? { ref: b.ref } : {}) };
        }
      }
      courses.push({ numero: c.numero, nom: c.nom, distance: dist, partants: parts,
                     ...(lv ? { releve: { depart: lv.depart, dernier_sec: lv.dernier ? lv.dernier.sec : null, t2_sec: lv.fenetre ? lv.fenetre.sec : null } } : {}) });
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
