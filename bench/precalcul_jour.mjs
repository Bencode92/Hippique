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
const T = require(path.join(ROOT, 'js', 'temps.js'));

const corresp = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/claude_correspondances.json'), 'utf8'));
const jkDist = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/jockeys_distance.json'), 'utf8'));
const CJ = require(path.join(ROOT, 'js', 'cote-juste.js'));
const modeleCJ = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cote_juste.json'), 'utf8'));
// La cote juste est calibrée sur le plat français : l'appliquer à Sha Tin ou
// Maronas n'aurait aucun sens (les variables d'hippodrome sont muettes et le
// biais du public n'est pas le même marché).
const FR = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hippos_filter.json'), 'utf8')).whitelist_fr;
const estFR = h => { const n = normH(h); return FR.some(w => n.startsWith(normH(w))); };
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
/* Périmètre de chaque donnée, par type de course.
 *
 * Trot (attelé, monté) : France Galop ne classe pas le trot. Un rang affiché
 * là est au mieux une homonymie — on voyait « éleveur 4409 » à côté d'un
 * trotteur à Agen. Rien.
 * Obstacle (haie, steeple, cross) : les classements France Galop couvrent
 * l'obstacle, donc les rangs valent ; la pastille, non — bench/jockeys_distance.py
 * est bâti sur `spe == 'PLAT'` seulement.
 * Plat français : tout, cote juste comprise.
 */
const TROT = new Set(['ATTELE', 'MONTE']);
const typeCourse = c => String(c.type || 'Plat').toUpperCase();
const estTrot = c => TROT.has(typeCourse(c));
const estPlat = c => typeCourse(c) === 'PLAT';
const COURT = { chevaux: 'ch', jockeys: 'jk', entraineurs: 'ent', eleveurs: 'el', proprietaires: 'pr', cravache_or: 'cr' };
// Un dossier de snapshot ne compte que s'il porte les CSV attendus : un autre
// workflow (pipeline-complet) y dépose aussi des .json, et le retenir vidait
// tous les rattachements sans rien signaler.
const estSnapCSV = d => fs.existsSync(path.join(ROOT, 'data/rankings', d, 'jockeys.csv'));
const SNAPS = fs.readdirSync(path.join(ROOT, 'data/rankings')).filter(d => /^\d{4}-\d{2}-\d{2}_/.test(d) && estSnapCSV(d)).sort();
const cache = new Map();

// Heure de Paris (HH:MM) d'un dossier de snapshot : le nom porte un horodatage UTC.
const heureParis = snap => {
  const m = snap.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})h(\d{2})$/);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(t).replace(':', 'h');
};
const enMinutes = h => { const m = String(h || '').match(/^(\d{1,2})h(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; };

/* Choix du classement, point-in-time.
 *
 * Règle de base : strictement antérieur à la date de la course — un snapshot
 * daté du même jour peut contenir les résultats de l'après-midi (cas du
 * 05/09 15h44, téléchargé après plusieurs courses).
 *
 * Exception, et seulement ici : les CSV France Galop du jour téléchargés AVANT
 * le premier départ. Benoit les récupère le matin ; ils ne peuvent rien
 * contenir d'une course qui n'a pas eu lieu, et les écarter ferait tourner la
 * carte sur des classements d'un mois. On compare donc l'heure du snapshot
 * (UTC dans son nom, convertie en heure de Paris) à l'horaire de la course.
 * Les bancs d'essai historiques (bench/features_pit.mjs) restent, eux, au `<`
 * strict : on n'y connaît pas l'heure de téléchargement de chaque archive.
 */
function indexes(date, horaire) {
  let choisi = null;
  for (const s of SNAPS) {
    const jour = s.slice(0, 10);
    if (jour < date) { choisi = s; continue; }
    if (jour !== date) continue;
    const hs = enMinutes(heureParis(s)), hc = enMinutes(horaire);
    if (hs != null && hc != null && hs < hc) choisi = s;
  }
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
            // js/temps.js, pas new Date() : les relevés sont horodatés en heure
            // de Paris sans fuseau, et le runner GitHub tourne en UTC — les
            // cotes live tombaient donc à null dans les fiches poussées par CI.
            const sec = r => dep && r.scraped_at ? Math.round(T.secAvant(dep, r.scraped_at)) : null;
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

/* ─── Markdown lisible sur téléphone ───────────────────────────────────────
 *
 * Le JSON est minifié : sur un téléphone c'est une seule ligne illisible.
 * GitHub, en revanche, rend le Markdown en tableaux. On écrit donc UN fichier
 * par hippodrome — personne ne défile 56 courses pour trouver la 3e de
 * Longchamp — plus un index du jour qui les liste.
 *
 * Colonnes tenues volontairement courtes pour tenir sur un écran de
 * téléphone ; les six rangs sont repliés dans une seule cellule.
 */
const slug = h => normH(h).toLowerCase();
const esp = v => (v == null ? '' : (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + ' %');
const nb = v => (v == null ? '–' : String(v).replace('.', ','));
const nb2 = v => (v == null ? '–' : v.toFixed(2).replace('.', ','));
const ord = r => r + (r === 1 ? 'er' : 'e');

function tableauCourse(c) {
  const L = [];
  const lisible = { ATTELE: 'attelé', MONTE: 'monté', HAIE: 'haies', STEEPLECHASE: 'steeple', CROSS: 'cross', PLAT: 'plat' }[typeCourse(c)] || typeCourse(c);
  // D'où viennent les cotes affichées : un relevé live (et à quel instant avant
  // le départ) ou l'extraction du matin. Sans ça on ne sait pas ce qu'on lit.
  const sec = c.releve && c.releve.dernier_sec;
  const aT = sec != null && sec > 0 ? `T−${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : null;
  const src = aT ? `cotes à ${aT}` : 'cotes de l\'extraction';
  const t = [c.horaire, lisible, c.distance ? c.distance + ' m' : null, c.partants.length + ' partants', src].filter(Boolean).join(' · ');
  L.push(`### ${c.numero}. ${c.nom}`, '', `*${t}*`, '');
  const cote = p => (p.ce > 1 ? p.ce : (p.c > 1 ? p.c : null));
  const avecCote = c.partants.some(p => cote(p));
  const avecCJ = c.partants.some(p => p.cj);
  // la cote du matin n'est montrée que si elle a bougé : sinon c'est une
  // colonne de doublons sur un écran de téléphone.
  const avecMatin = c.partants.some(p => p.c > 1 && p.ce > 1 && Math.abs(p.ce - p.c) / p.c >= 0.05);
  // ordre de lecture : la cote croissante (donc l'Optimale) ; sinon le numéro
  const tri = avecCote
    ? [...c.partants].sort((a, b) => (cote(a) || 1e9) - (cote(b) || 1e9))
    : [...c.partants].sort((a, b) => (+a.n || 0) - (+b.n || 0));
  // n° et chiffres à droite, noms à gauche : les colonnes de nombres se
  // comparent d'un coup d'œil, les noms restent lisibles.
  const entete = [['n°', '--:'], ['cheval', ':--'], ['cote', '--:']];
  if (avecMatin) entete.push(['matin', '--:']);
  if (avecCJ) entete.push(['juste', '--:'], ['espérance', '--:']);
  entete.push(['jockey', ':--']);
  const avecRangs = c.partants.some(p => p.rangs && Object.keys(p.rangs).length);
  if (avecRangs) entete.push(['jk/ent/él/pr', '--:']);
  L.push('| ' + entete.map(e => e[0]).join(' | ') + ' |');
  L.push('|' + entete.map(e => e[1]).join('|') + '|');
  for (const p of tri) {
    const r = p.rangs || {};
    const rangs = ['jk', 'ent', 'el', 'pr'].map(k => (r[k] ? r[k].r : null)).map(v => (v == null ? '–' : v)).join('/');
    const jk = (p.jockey || '') + (p.pastille ? ` ${p.pastille.type === 'distance' ? '' : '🏆'}${ord(p.pastille.rang)}` : '');
    const ligne = [p.n, p.cheval || '', nb(cote(p))];
    if (avecMatin) ligne.push(nb(p.c));
    if (avecCJ) ligne.push(nb2(p.cj && p.cj.cote), p.cj ? (p.cj.play ? `**${esp(p.cj.esp)}**` : esp(p.cj.esp)) : '');
    ligne.push(jk);
    if (avecRangs) ligne.push(rangs);
    L.push('| ' + ligne.join(' | ') + ' |');
  }
  L.push('');
  return L;
}

function ecrireMarkdown(date, out) {
  const dossier = path.join(ROOT, 'data/jour');
  const index = [`# Courses du ${date.split('-').reverse().join('/')}`, ''];
  if (out.snapshot) index.push(`Classements France Galop : **${out.snapshot.replace('_', ' ').replace('h', 'h')}** (UTC).`, '');
  const faits = [];
  for (const [hip, courses] of Object.entries(out.hippodromes)) {
    const f = `${date}_${slug(hip)}.md`;
    const L = [`# ${hip} — ${date.split('-').reverse().join('/')}`, ''];
    const cotees = courses.filter(c => c.partants.some(p => p.c > 0)).length;
    const nLive = courses.filter(c => c.releve && c.releve.dernier_sec > 0).length;
    L.push(`${courses.length} courses${cotees && cotees < courses.length ? ` (${cotees} avec cotes)` : ''}.`
      + (!cotees ? ''
         : nLive ? ` ${nLive} ${nLive > 1 ? 'ont' : 'a'} un relevé live — l'instant est donné sous chaque course. Les autres portent les cotes de l'extraction.`
                 : ` Cotes de l'extraction : la boucle pré-course n'a pas encore relevé. Rafraîchis à l'approche du départ.`), '');
    const avecCJ = courses.some(c => c.partants.some(p => p.cj));
    if (avecCJ) L.push('**Lecture.** L\'ordre est la cote croissante : c\'est aussi l\'Optimale, qui ne retient plus que le prix.',
                       'La *cote juste* est la cote que le cheval mériterait ; l\'espérance en gras est un PLAY (≥ 0).',
                       'Les rangs sont jockey / entraîneur / éleveur / propriétaire dans les classements ci-dessus.', '');
    else {
      // Trois raisons distinctes à l'absence de cote juste — dire laquelle,
      // sinon la fiche annonce un problème de calibration alors que le PMU
      // n'a simplement pas encore publié les cotes.
      const trot = courses.every(c => TROT.has(typeCourse(c)));
      L.push(!cotees ? '*Le PMU n\'a pas encore publié les cotes de cette réunion : ni cote, ni cote juste, ni Optimale. Reviens plus tard dans la matinée.*'
                     : trot ? '*Trot : France Galop ne classe ni les drivers ni les chevaux d\'attelage. Cotes seules.*'
                            : '*Pas de cote juste ici : elle n\'est calibrée que sur le plat français.*', '');
    }
    L.push('---', '');
    for (const c of courses) L.push(...tableauCourse(c));
    fs.writeFileSync(path.join(dossier, f), L.join('\n'));
    faits.push(f);
    index.push(`- [**${hip}**](${f}) — ${courses.length} courses${courses[0] && courses[0].horaire ? `, à partir de ${courses[0].horaire}` : ''}`);
  }
  index.push('', `*Généré par \`bench/precalcul_jour.mjs\`. Donnée brute : [${date}.json](${date}.json).*`);
  fs.writeFileSync(path.join(dossier, date + '.md'), index.join('\n'));
  return faits.length;
}

function journee(date) {
  const fichiers = fs.readdirSync(path.join(ROOT, 'data/courses')).filter(f => f.startsWith(date + '_') && f.endsWith('.json'));
  if (!fichiers.length) return null;
  const live = cotesLive(date);
  const out = { date, genere: new Date().toISOString(), snapshot: null, hippodromes: {} };
  const snapsVus = new Set();
  let nP = 0, nR = 0;
  for (const f of fichiers.sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/courses', f), 'utf8'));
    const hip = d.hippodrome || f.replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/\.json$/, '');
    const courses = [];
    for (const c of d.courses || []) {
      const dist = num(c.distance);
      const ix = indexes(date, c.horaire);
      if (ix) snapsVus.add(ix._snap);
      const parts = (c.participants || []).map(p => {
        const o = { n: p['n°'] || p.numero || p.n };
        if (ix && !estTrot(c)) {
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
        // Lisible seul : sans le nom, le JSON n'est qu'une liste de numéros.
        o.cheval = nomCheval(p.cheval);
        if (p.jockey) o.jockey = String(p.jockey).trim();
        // Cote PMU de l'extraction du matin — la seule disponible avant que le
        // scraper pré-course ne tourne ; cotes.live/t2 l'affinent ensuite.
        const cP = num(p.cote), cR = num(p.cote_reference);
        if (cP > 1) o.c = cP;
        if (cR > 1) o.cr = cR;
        if (p.cote_tendance) o.tend = p.cote_tendance;
        const pa = estPlat(c) ? pastille(p.jockey, dist, c.nom) : null;
        if (pa) o.pastille = pa;
        const fc = estTrot(c) ? null : formeCh[nomCheval(p.cheval)], fj = estTrot(c) ? null : formeJk[String(p.jockey || '').toUpperCase().trim()];
        if (fc?.tendance || fj?.tendance) o.forme = { ...(fc?.tendance ? { ch: fc.tendance } : {}), ...(fj?.tendance ? { jk: fj.tendance } : {}) };
        nP++;
        return o;
      });
      /* Optimale : après la re-mesure honnête (les leviers ne battent pas le
       * marché), la formule retenue par best_formulas.json n'a plus qu'un
       * levier — « Cote (1/cote) ». L'Optimale EST donc le classement par cote
       * croissante. On l'écrit tel quel plutôt que de le faire recalculer par
       * la page, pour que le JSON se lise seul avant la course. */
      /* Les cotes live AVANT tout calcul : l'Optimale et la cote juste doivent
       * porter sur le prix du moment, pas sur celui de l'extraction du matin.
       * C'est tout l'objet du refresh — sinon la fiche affiche une cote de 07h43
       * à deux minutes du départ. */
      const lv = live.get(`${normH(hip)}|${num(c.numero)}`);
      if (lv) {
        // cote du dernier relevé et cote du relevé T-2 (celui qui fait foi pour le test)
        for (const p of parts) {
          const d1 = lv.dernier && lv.dernier.cotes[String(p.n)], d2 = lv.fenetre && lv.fenetre.cotes[String(p.n)];
          const b = lv.base[String(p.n)];
          if (d1 || d2 || b) p.cotes = { ...(d1 ? { live: d1 } : {}), ...(d2 ? { t2: d2 } : {}), ...(b && b.ref ? { ref: b.ref } : {}) };
        }
      }
      // `ce` = cote effective : le dernier relevé s'il existe, sinon l'extraction.
      // `c` reste la cote du matin, pour lire la dérive.
      for (const p of parts) {
        const l = num(p.cotes && p.cotes.live);
        p.ce = l > 1 ? l : (p.c > 1 ? p.c : null);
      }

      const parCote = parts.filter(x => x.ce > 1).sort((a, b) => a.ce - b.ce);
      parCote.forEach((x, i) => { x.opt = i + 1; });

      /* Cote juste (js/cote-juste.js, modèle data/cote_juste.json) : proba
       * réelle sachant la cote et le contexte. Espérance = p × cote − 1,
       * PLAY si ≥ 0. Diagnostic, pas un tri de la règle.
       * On la recalcule sur la cote effective ; `cote_reference` reste la
       * référence du matin, qui est bien ce que la variable « dérive » attend. */
      if (estFR(hip) && estPlat(c)) {
        const ps = (c.participants || []).map(q => {
          const o = parts.find(x => String(x.n) === String(q['n°'] || q.numero || q.n));
          return o && o.ce > 1 ? { ...q, cote: o.ce, _n: o.n } : { ...q, _n: o ? o.n : null };
        }).filter(q => num(q.cote) > 1);
        if (ps.length >= 5) {
          const r = CJ.calculer(ps, { hippodrome: hip, course: c.nom }, modeleCJ);
          for (const q of ps) {
            const v = r.get(q);
            if (!v) continue;
            const o = parts.find(x => String(x.n) === String(q._n));
            if (o) o.cj = { cote: +v.coteJuste.toFixed(2), esp: +(100 * v.esperance).toFixed(1), play: v.play };
          }
        }
      }

      courses.push({ numero: c.numero, nom: c.nom, horaire: c.horaire || null, type: typeCourse(c), distance: dist, partants: parts,
                     ...(ix ? { snapshot: ix._snap } : {}),
                     ...(lv ? { releve: { depart: lv.depart, dernier_sec: lv.dernier ? lv.dernier.sec : null, t2_sec: lv.fenetre ? lv.fenetre.sec : null } } : {}) });
      nR++;
    }
    out.hippodromes[hip] = courses;
  }
  const snaps = [...snapsVus].sort();
  out.snapshot = snaps.length ? snaps[snaps.length - 1] : null;
  if (snaps.length > 1) out.snapshots = snaps;   // le matin peut basculer sur le classement du jour
  fs.mkdirSync(path.join(ROOT, 'data/jour'), { recursive: true });
  const chemin = path.join(ROOT, 'data/jour', date + '.json');
  fs.writeFileSync(chemin, JSON.stringify(out));
  const nMd = ecrireMarkdown(date, out);
  return { chemin, nR, nP, nMd, ko: Math.round(fs.statSync(chemin).size / 1024), snap: out.snapshot };
}

const arg = process.argv[2];
const dates = arg === '--tout'
  ? [...new Set(fs.readdirSync(path.join(ROOT, 'data/courses')).filter(f => /^\d{4}-\d{2}-\d{2}_/.test(f)).map(f => f.slice(0, 10)))].sort()
  : [arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : new Date().toISOString().slice(0, 10)];
for (const d of dates) {
  const r = journee(d);
  if (r) console.log(`${d} · ${r.nR} courses · ${r.nP} partants · ${r.ko} Ko · ${r.nMd} fiches Markdown · snapshot ${r.snap}`);
  else if (dates.length === 1) console.log(`${d} : aucune course`);
}
