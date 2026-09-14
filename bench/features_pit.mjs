/* Construit la table des leviers, partant par partant, avec le rattachement
 * partagé js/matching.js et les classements datés (point-in-time).
 *
 * Univers : data/courses depuis le 16/04/2026, hippodromes FR, course.type Plat,
 * 5 partants et plus, arrivée connue, cotes complètes (Σ1/cote entre 1,05 et 1,6).
 * Pour chaque course : le snapshot data/rankings le plus récent ANTÉRIEUR OU ÉGAL
 * à sa date ; classement de l'année d'abord, 2025 en repli.
 *
 * Sortie : bench/out/features_pit.jsonl, une ligne par course.
 * Les modèles (bench/leviers_sans_cote.py) lisent ce fichier — ils ne
 * refont pas le rattachement.
 *
 *   node bench/features_pit.mjs
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = require(path.join(ROOT, 'js', 'matching.js'));

const DEPUIS = '2026-04-16';
const fr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hippos_filter.json'), 'utf8')).whitelist_fr;
const hippoFr = f => { const h = f.replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/\.json$/, '').replace(/_/g, '-'); return fr.some(w => h.startsWith(w)); };
const corresp = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/claude_correspondances.json'), 'utf8'));
const num = v => { if (v == null) return null; const x = parseFloat(String(v).replace(',', '.').replace(/[^\d.\-]/g, '')); return isFinite(x) ? x : null; };

function lireCSV(f) {
  if (!fs.existsSync(f)) return [];
  const lignes = fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim());
  const cols = lignes[0].split('\t');
  return lignes.slice(1).map(l => Object.fromEntries(l.split('\t').map((v, i) => [cols[i], v])));
}
const CATS = ['jockeys', 'entraineurs', 'chevaux', 'eleveurs', 'proprietaires'];
const SNAPS = fs.readdirSync(path.join(ROOT, 'data/rankings')).filter(d => /^\d{4}-\d{2}-\d{2}_/.test(d)).sort();
const cache = new Map();
function indexesPour(date) {
  let choisi = null;
  for (const s of SNAPS) if (s.slice(0, 10) <= date) choisi = s;
  if (!choisi) return null;
  if (cache.has(choisi)) return cache.get(choisi);
  const ix = { _snap: choisi };
  for (const cat of CATS) {
    const dir = path.join(ROOT, 'data/rankings', choisi);
    ix[cat] = M.creerIndex(lireCSV(path.join(dir, cat + '.csv')), cat, { correspondances: corresp.correspondances });
    ix[cat + '_2025'] = M.creerIndex(lireCSV(path.join(dir, cat + '_2025.csv')), cat, { correspondances: corresp.correspondances });
  }
  cache.set(choisi, ix);
  return ix;
}
// stats d'une ligne de classement personne : taux V / P et gain par partant, null si trop peu de partants
function statsPersonne(row, minPartants) {
  if (!row) return null;
  const pa = num(row.Partants) || 0;
  if (pa < minPartants) return { pa, tv: null, tp: null, gp: num(row['Gain/Part.']) || 0 };
  return { pa, tv: (num(row.Victoires) || 0) / pa, tp: (num(row.Places) || 0) / pa, gp: num(row['Gain/Part.']) || 0 };
}
function chercher(ix, cat, nom) {
  const r = M.rattacher(ix[cat], nom, cat) || M.rattacher(ix[cat + '_2025'], nom, cat);
  return r ? r.item : null;
}
const musique = m => { const v = (String(m || '').match(/\d+/g) || []).map(Number).filter(x => x > 0 && x < 25); return v.length ? v : null; };
const moy = a => a.reduce((s, x) => s + x, 0) / a.length;

const out = [];
let nFichiers = 0;
for (const f of fs.readdirSync(path.join(ROOT, 'data/courses')).filter(f => f.endsWith('.json') && f.slice(0, 10) >= DEPUIS && hippoFr(f)).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/courses', f), 'utf8'));
  if ((d.type_reunion || '').toLowerCase() !== 'plat') continue;
  const date = f.slice(0, 10);
  const ix = indexesPour(date);
  if (!ix) continue;
  nFichiers++;
  for (const c of d.courses || []) {
    if ((c.type || 'Plat').toUpperCase() !== 'PLAT') continue;
    const ps = (c.participants || []).filter(p => (num(p.cote) || 0) > 1);
    if (ps.length < 5) continue;
    const gi = ps.findIndex(p => num(p.arrivee) === 1);
    if (gi < 0) continue;
    const inv = ps.reduce((s, p) => s + 1 / num(p.cote), 0);
    if (inv < 1.05 || inv > 1.6) continue;           // cotes incomplètes ou pas finales
    const nomc = (c.nom || '').toUpperCase();
    const rows = ps.map(p => {
      const jk = statsPersonne(chercher(ix, 'jockeys', p.jockey), 20);
      const en = statsPersonne(chercher(ix, 'entraineurs', p.entraineur), 20);
      const el = statsPersonne(chercher(ix, 'eleveurs', p['éleveurs']), 10);
      const pr = statsPersonne(chercher(ix, 'proprietaires', p['propriétaire']), 10);
      const chRow = chercher(ix, 'chevaux', p.cheval);
      const chCo = chRow ? (num(chRow.Courses) || 0) : 0;
      const ch = chRow ? { co: chCo, tv: chCo >= 2 ? (num(chRow.Victoires) || 0) / chCo : null, tp: chCo >= 2 ? (num(chRow.Places) || 0) / chCo : null, gm: num(chRow['Gain moyen']) || 0, val: num(chRow.Valeur) || null } : null;
      const mus = musique(p.musique);
      const nc = num(p.nb_courses) || 0;
      const cote = num(p.cote), cr = num(p.cote_reference);
      const pc = M.parseCheval(p.cheval);
      return {
        num: p['n°'], cheval: pc.nom, age: pc.age, sexe: pc.sexe, race: pc.race,
        cote, cote_ref: cr && cr > 1 ? cr : null, gagnant: num(p.arrivee) === 1, arrivee: num(p.arrivee),
        valeur: num(p.valeur), poids: num(p.poids), corde: num(p.corde), gains: num(p.gains) || 0,
        nb_courses: nc, nb_victoires: num(p.nb_victoires) || 0, nb_places: num(p.nb_places) || 0,
        mus_moy: mus ? moy(mus) : null, mus_rec: mus ? moy(mus.slice(0, 3)) : null, mus_n: mus ? mus.length : 0,
        equipement: !!String(p['equipement(s)'] || '').trim(),
        jk, en, el, pr, ch,
      };
    });
    out.push({
      date, snap: ix._snap, hippodrome: d.hippodrome, course: c.nom, numero: c.numero,
      distance: num(c.distance) || 0, terrain: c.terrain || null, partants: ps.length, overround: inv,
      type: nomc.includes('HANDICAP') ? 'handicap' : nomc.includes('MAIDEN') || nomc.includes('INEDITS') ? 'maiden' : nomc.includes('RECLAMER') ? 'reclamer' : 'conditions',
      gagnant: gi, rows,
    });
  }
}
fs.mkdirSync(path.join(ROOT, 'bench/out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'bench/out/features_pit.jsonl'), out.map(o => JSON.stringify(o)).join('\n') + '\n');
const nP = out.reduce((s, o) => s + o.partants, 0);
const taux = k => (100 * out.reduce((s, o) => s + o.rows.filter(r => r[k] && (r[k].tv != null || r[k].co > 0)).length, 0) / nP).toFixed(1);
console.log(`${nFichiers} réunions · ${out.length} courses · ${nP} partants → bench/out/features_pit.jsonl`);
console.log(`stats disponibles (≥ seuil de partants) : jockey ${taux('jk')} %  entraîneur ${taux('en')} %  cheval ${taux('ch')} %  éleveur ${taux('el')} %  propriétaire ${taux('pr')} %`);
