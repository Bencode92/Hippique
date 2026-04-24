#!/usr/bin/env node
/**
 * LIVE SCORING — 100% identique au HTML
 *
 * Charge ranking-loader.js et exécute les MÊMES fonctions de scoring.
 * Pas de duplication de code = 100% identique garanti.
 *
 * Usage : node live-scoring.js          → toutes les courses cibles
 *         node live-scoring.js R1 C3    → course spécifique
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://online.turfinfo.api.pmu.fr/rest/client/61';

// ====================================================================
// ÉTAPE 1 : Simuler l'environnement navigateur minimal pour ranking-loader.js
// ====================================================================
global.window = {
  location: { hostname: 'localhost' },
  rankingLoader: undefined,
};
global.document = { addEventListener: () => {} };
// Silencer les logs de ranking-loader.js pour la vitesse
const _log = console.log.bind(console);
global.console = { ...console, log: () => {}, warn: () => {} };
global.fetch = (url) => {
  return new Promise((resolve) => {
    // Intercepter TOUTES les URLs et charger depuis le disque local
    let filePath = null;

    // URL complète raw.githubusercontent.com
    const rawMatch = url.match(/raw\.githubusercontent\.com\/Bencode92\/Hippique\/main\/(.+)/);
    if (rawMatch) {
      filePath = path.join(__dirname, rawMatch[1]);
    }

    // Chemin relatif /Hippique/data/... ou /data/...
    const relMatch = url.match(/(?:\/Hippique)?\/data\/(.+)/);
    if (!filePath && relMatch) {
      filePath = path.join(__dirname, 'data', relMatch[1]);
    }

    // Chemin relatif simple data/...
    if (!filePath && url.startsWith('data/')) {
      filePath = path.join(__dirname, url);
    }

    if (filePath) {
      // Enlever les query params (?t=...)
      filePath = filePath.split('?')[0];
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        resolve({
          ok: true,
          json: () => Promise.resolve(JSON.parse(content)),
          text: () => Promise.resolve(content),
        });
      } catch (e) {
        resolve({ ok: false, status: 404 });
      }
    } else {
      resolve({ ok: false, status: 404 });
    }
  });
};

// ====================================================================
// ÉTAPE 2 : Charger ranking-loader.js (le vrai code du site)
// ====================================================================
let rlCode = fs.readFileSync(path.join(__dirname, 'js/ranking-loader.js'), 'utf8');
// Rendre rankingLoader accessible globalement en Node.js
rlCode = rlCode.replace('const rankingLoader = {', 'global.rankingLoader = {');
eval(rlCode);

// Maintenant `rankingLoader` est disponible (c'est une variable globale dans le fichier)

// ====================================================================
// ÉTAPE 3 : API PMU
// ====================================================================
function apiGet(endpoint) {
  return new Promise((resolve) => {
    const url = `${BASE_URL}/${endpoint}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode === 200) { try { resolve(JSON.parse(d)); } catch (e) { resolve(null); } }
        else resolve(null);
      });
    }).on('error', () => resolve(null));
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ====================================================================
// ÉTAPE 4 : Mapper les données PMU au format attendu par ranking-loader.js
// ====================================================================
function mapParticipant(p) {
  const rd = p.dernierRapportDirect || {};
  const rr = p.dernierRapportReference || {};

  return {
    'n°': String(p.numPmu || ''),
    cheval: buildChevalLabel(p),
    jockey: typeof p.driver === 'string' ? p.driver : (p.driver?.nom || ''),
    entraineur: typeof p.entraineur === 'string' ? p.entraineur : (p.entraineur?.nom || ''),
    'entraîneur': typeof p.entraineur === 'string' ? p.entraineur : (p.entraineur?.nom || ''),
    'propriétaire': typeof p.proprietaire === 'string' ? p.proprietaire : (p.proprietaire?.nom || ''),
    'éleveurs': typeof p.eleveur === 'string' ? p.eleveur : (p.eleveur?.nom || ''),
    poids: p.handicapPoids ? `${p.handicapPoids / 10} kg` : '',
    valeur: p.handicapPoids ? String(p.handicapPoids / 10) : '',
    cote: typeof rd === 'object' ? rd.rapport : 0,
    cote_reference: typeof rr === 'object' ? rr.rapport : 0,
    cote_tendance: typeof rd === 'object' ? (rd.indicateurTendance || '') : '',
    musique: p.musique || '',
    nb_courses: p.nombreCourses || 0,
    nb_victoires: p.nombreVictoires || 0,
    nb_places: p.nombrePlaces || 0,
    gains: p.gainsParticipant?.gainsCarriere || 0,
    corde: p.placeCorde ? `(Corde:${String(p.placeCorde).padStart(2, '0')})` : '',
    arrivee: null,
  };
}

function buildChevalLabel(p) {
  const nom = (p.nom || '').toUpperCase();
  const sexe = (p.sexe || '').toUpperCase();
  const race = (p.race || '').toUpperCase().replace('-', '_');
  const age = p.age || '';
  const sexeMap = { MALES: 'M.', FEMELLES: 'F.', HONGRES: 'H.', MALE: 'M.', FEMELLE: 'F.', HONGRE: 'H.' };
  const raceMap = { PUR_SANG: 'PU.', AQPS: 'AQPS.', ARABE: 'AR.', TROTTEUR: 'TR.' };
  const s = sexeMap[sexe] || (sexe ? sexe[0] + '.' : '');
  const r = raceMap[race] || (race ? race.slice(0, 2) + '.' : '');
  return `${nom} ${s}${r} ${age} a.`.trim();
}

// ====================================================================
// ÉTAPE 5 : Classement LEVIERS — meilleur critère par distance
// ====================================================================
function loadLocalJSON(file) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', file), 'utf8')); }
  catch { return null; }
}

function buildLookup(data, keyField) {
  const m = {};
  if (!data?.resultats) return m;
  const list = Array.isArray(data.resultats) ? data.resultats : Object.entries(data.resultats).map(([k, v]) => ({ _key: k, ...v }));
  list.forEach(item => { const k = (item[keyField] || item._key || '').toUpperCase().trim(); if (k) m[k] = item; });
  return m;
}

let levierData = null;
function getLevierData() {
  if (levierData) return levierData;
  const jk25 = buildLookup(loadLocalJSON('jockeys_2025_ponderated_latest.json'), 'NomPostal');
  const jk26 = buildLookup(loadLocalJSON('jockeys_ponderated_latest.json'), 'NomPostal');
  const chx25 = buildLookup(loadLocalJSON('chevaux_2025_ponderated_latest.json'), 'Nom');
  const chx26 = buildLookup(loadLocalJSON('chevaux_ponderated_latest.json'), 'Nom');
  const cr25 = buildLookup(loadLocalJSON('cravache_or_2025_ponderated_latest.json'), 'NomPostal');
  const cr26 = buildLookup(loadLocalJSON('cravache_or_ponderated_latest.json'), 'NomPostal');
  // Forme récente + combo jockey/entraîneur : fichiers stables (pas de snapshot daté)
  const forme = (loadLocalJSON('chevaux_forme_recente.json') || {}).resultats || {};
  const combo = (loadLocalJSON('combo_jockey_entraineur.json') || {}).resultats || {};
  levierData = { jk25, jk26, chx25, chx26, cr25, cr26, forme, combo };
  return levierData;
}

// Correspondances pré-calculées (claude_correspondances.json) — chargées une fois
let _correspMap = null;
let _knownForeign = null;
function loadCorresp() {
  if (_correspMap !== null) return;
  _correspMap = {};
  _knownForeign = new Set();
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'claude_correspondances.json'), 'utf8'));
    for (const [raw, info] of Object.entries(data.correspondances || {})) {
      _correspMap[raw.toUpperCase().trim()] = (info.match || '').toUpperCase().trim();
    }
    (data.etrangers || []).forEach(e => _knownForeign.add(e.toUpperCase().trim()));
  } catch {}
}

// Fuzzy match : "C. DEMURO" ou "DEMURO C." → "CRISTIAN DEMURO"
// Consulte aussi claude_correspondances.json et court-circuite les étrangers connus.
function fuzzyMatch(map, shortName) {
  if (!shortName || shortName.length < 3) return null;
  loadCorresp();
  const key = shortName.toUpperCase().trim();
  if (map[key]) return map[key];

  // Correspondances pré-calculées (cas tordus : "M.Z .SAHEBJAN" → "MOHAMMAD ZEESHAAN SAHEBJAN")
  if (_correspMap[key] && map[_correspMap[key]]) return map[_correspMap[key]];

  // Étrangers connus : pas la peine de chercher
  if (_knownForeign.has(key)) return null;

  let init = '', fam = '';
  let m = key.match(/^([A-Z])\.?\s*(.{3,})$/);
  if (m) { init = m[1]; fam = m[2].trim(); }
  if (!m) { m = key.match(/^(.{3,?})\s+([A-Z])\.?$/); if (m) { fam = m[1].trim(); init = m[2]; } }
  if (!m) {
    for (const [k, v] of Object.entries(map)) {
      if (k === key) return v;
      if (key.length >= 5 && (k.includes(key) || key.includes(k))) return v;
    }
    return null;
  }
  if (fam.length < 3) return null;
  for (const [k, v] of Object.entries(map)) {
    if (k.endsWith(fam) || k.endsWith(' ' + fam) || k.includes(' ' + fam)) {
      const prenom = k.replace(fam, '').trim();
      if (prenom && prenom[0] === init) return v;
    }
  }
  return null;
}

function extractNomCheval(chevalStr) {
  return (chevalStr || '').replace(/\s+[MFH]\.\w*\.?\s*\d+\s*a\.?\s*$/i, '').trim().toUpperCase();
}

// Version des formules — bump quand le calcul change (fuzzyMatch, tie-break, exploration élargie…)
const BEST_FORMULAS_VERSION = 2;

// Charger ou calculer les formules optimales automatiquement
let bestFormulas = null;
function loadBestFormulas() {
  if (bestFormulas) return bestFormulas;
  const filePath = path.join(__dirname, 'data', 'best_formulas.json');
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data._version === BEST_FORMULAS_VERSION) {
      bestFormulas = data;
      const keys = Object.keys(bestFormulas).filter(k => !k.startsWith('_'));
      _log(`📋 Formules leviers v${BEST_FORMULAS_VERSION}: ${keys.map(k => k + '=' + (bestFormulas[k].leviers||[]).join('+')).join(' | ')}`);
      return bestFormulas;
    }
    _log(`🔄 best_formulas.json v${data._version || 1} détecté — recalcul v${BEST_FORMULAS_VERSION} (fuzzyMatch+tie-break+2L→6L)...`);
  } catch {}
  bestFormulas = computeBestFormulasFromHistory();
  try {
    fs.writeFileSync(filePath, JSON.stringify({ _version: BEST_FORMULAS_VERSION, _generatedAt: new Date().toISOString(), ...bestFormulas }, null, 2));
    _log('💾 best_formulas.json sauvegardé');
  } catch {}
  return bestFormulas;
}

function computeBestFormulasFromHistory() {
  const dir = path.join(__dirname, 'data', 'courses');
  let files;
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort(); } catch { return {}; }

  const ldFull = getLevierData();
  // Buckets alignés avec stats.html :
  // - 4 coarse (sprint/mile/middle/staying) — toujours utilisables (beaucoup de données)
  // - 11 fine (par tranche précise) — utilisés si assez de courses (min 15)
  // - 1 premium (LC+SC+Chantilly+FB+Deauville, toutes distances) — si hippo match
  // Un même course alimente plusieurs buckets (coarse + fine + premium si applicable)
  const FINE_RANGES = [
    ['1000m', 900, 1099], ['1200m', 1100, 1299], ['1300m', 1300, 1399],
    ['1400m', 1400, 1499], ['1500m', 1500, 1599], ['1600m', 1600, 1699],
    ['1800m', 1700, 1899], ['2000m', 1900, 2099], ['2100m', 2100, 2199],
    ['2400m', 2200, 2500], ['3000m+', 2600, 99999],
  ];
  const buckets = { sprint: [], mile: [], middle: [], staying: [], premium: [] };
  FINE_RANGES.forEach(([k]) => { buckets[k] = []; });
  // Liste exhaustive alignée avec stats.html — tous les leviers sont explorés
  // 22 leviers de base + 10 croisés (pré-calculés, 50/50) identiques à stats.html
  const levierNames = ['Cote (1/cote)', 'Cote ref', 'Dérive cote', 'Valeur FG', 'Musique',
    'Gains (log)', 'TauxV indiv', 'TauxP indiv', 'NbVictoires',
    'Ch TauxV', 'Ch TauxP', 'Ch Rang', 'Ch GainMoy', 'Ch ScoreMixte',
    'Jk TauxV', 'Jk TauxP', 'Jk Rang', 'Jk ScoreMixte', 'Jk GainMoy',
    'Cravache Rang', 'Forme récente', 'Combo Jk*Ent',
    // Croisés 50/50 — peuvent entrer dans le top8 des solos et alimenter les combos
    'Dérive × JkRang', 'Dérive × ChTauxV', 'Dérive × Cote',
    'Cote × JkRang', 'Cote × ChTauxV', 'Cote × Valeur',
    'JkRang × ChTauxV', 'JkRang × Musique',
    'Valeur × Musique', 'ChTauxV × Musique'];

  // Charger les snapshots datés pour anti-leakage
  const snapshotsDir = path.join(__dirname, 'data', 'rankings');
  const snapshots = [];
  try {
    const dirs = fs.readdirSync(snapshotsDir).filter(d => /^\d{4}-\d{2}-\d{2}/.test(d)).sort();
    dirs.forEach(d => {
      try {
        const chx = loadLocalJSON(`rankings/${d}/chevaux.json`);
        const jk = loadLocalJSON(`rankings/${d}/jockeys.json`);
        const cr = loadLocalJSON(`rankings/${d}/cravache_or.json`);
        if (chx || jk) snapshots.push({ date: d, chx: buildLookup(chx, 'Nom'), jk: buildLookup(jk, 'NomPostal'), cr: buildLookup(cr, 'NomPostal') });
      } catch {}
    });
  } catch {}

  function getSnapshotBefore(courseDate) {
    // Snapshot du MÊME JOUR ou AVANT = OK (pris le matin, course l'après-midi)
    // "2026-04-16_09h00".slice(0,10) = "2026-04-16" <= "2026-04-16" → OK
    let best = null;
    for (const s of snapshots) {
      const snapDate = s.date.slice(0, 10); // extraire YYYY-MM-DD
      if (snapDate <= courseDate) best = s;
      else break;
    }
    return best;
  }

  const today = new Date().toISOString().split('T')[0];

  // Seuil de l'entraînement : avant cette date, les snapshots datés n'existent pas
  // → les rankings "latest" seraient appliqués à des courses passées = leakage.
  // Les courses 2025 n'ont pas les cotes capturées. Donc on part du premier snapshot daté.
  const TRAINING_START_DATE = '2026-04-16';

  // Charger les courses terminées — anti-leakage strict (snapshots datés dispos)
  let skippedBefore = 0, kept = 0;
  files.forEach(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (data.type_reunion && data.type_reunion.toLowerCase() !== 'plat') return;
      const fileDate = (f.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
      // Filtre : pas de snapshot daté avant TRAINING_START_DATE → rankings biaisés → skip
      if (fileDate && fileDate < TRAINING_START_DATE) { skippedBefore++; return; }
      const hippoName = f.slice(11, -5).toLowerCase();
      const isPremium = PREMIUM_HIPPOS.has(hippoName);

      (data.courses || []).forEach(c => {
        if (c.type && c.type.toLowerCase() !== 'plat') return;
        if (!c.arrivee_definitive || !c.participants?.some(p => p.arrivee === 1)) return;
        const dist = parseInt(String(c.distance || '').replace(/[^0-9]/g, '')) || 0;
        const dl = dist < 1400 ? 'sprint' : dist < 1700 ? 'mile' : dist < 2200 ? 'middle' : 'staying';
        const avecCotes = c.participants.filter(p => p.cote > 1);
        const parCote = [...avecCotes].sort((a, b) => a.cote - b.cote);
        if (parCote.length < 2) return;

        // Créer un ld spécifique à cette course (anti-leakage)
        const isFuture = !fileDate || fileDate >= today;
        let ld;
        if (isFuture) {
          ld = ldFull; // course future → latest OK
        } else {
          // Course passée → 2025 only + snapshot 2026 d'avant la course
          const snap = getSnapshotBefore(fileDate);
          ld = {
            jk25: ldFull.jk25, jk26: snap ? snap.jk : {},
            chx25: ldFull.chx25, chx26: snap ? snap.chx : {},
            cr25: ldFull.cr25, cr26: snap && snap.cr ? snap.cr : {},
            // forme + combo : fichiers stables latest (aligné avec stats.html)
            forme: ldFull.forme, combo: ldFull.combo,
          };
        }

        const enriched = c.participants.map(p => {
          const levs = {};
          levierNames.forEach(name => { levs[name] = getLevierValue(name, p, ld); });
          return { ...p, _levs: levs };
        });
        const payload = { enriched, parCote };
        buckets[dl].push(payload);
        // Bucket fin correspondant à la distance exacte (si applicable)
        for (const [k, lo, hi] of FINE_RANGES) {
          if (dist >= lo && dist <= hi) { buckets[k].push(payload); break; }
        }
        // Pool premium : hippos haut de gamme — alimenté en plus de tous les autres
        if (isPremium) buckets.premium.push(payload);
      });
      kept++;
    } catch {}
  });

  _log(`📊 Entraînement : ${kept} fichiers courses conservés (${skippedBefore} skippés < ${TRAINING_START_DATE} = leakage évité)`);

  // Helpers de génération de combinaisons (identiques à stats.html)
  function combosOfSize(items, size) {
    if (size === 1) return items.map(x => [x]);
    const res = [];
    for (let i = 0; i <= items.length - size; i++)
      for (const tail of combosOfSize(items.slice(i + 1), size - 1))
        res.push([items[i], ...tail]);
    return res;
  }
  function weightSets(n) {
    if (n === 2) return [[0.2,0.8],[0.4,0.6],[0.5,0.5],[0.6,0.4],[0.8,0.2]];
    if (n === 3) return [[0.5,0.3,0.2],[0.4,0.4,0.2],[0.4,0.3,0.3],[0.6,0.2,0.2],[0.33,0.33,0.34]];
    if (n === 4) return [[0.4,0.3,0.2,0.1],[0.3,0.3,0.2,0.2],[0.25,0.25,0.25,0.25],[0.4,0.2,0.2,0.2],[0.5,0.2,0.2,0.1]];
    if (n === 5) return [[0.3,0.25,0.2,0.15,0.1],[0.2,0.2,0.2,0.2,0.2],[0.35,0.25,0.2,0.1,0.1],[0.4,0.2,0.15,0.15,0.1]];
    if (n === 6) return [[0.25,0.2,0.15,0.15,0.15,0.1],[0.17,0.17,0.17,0.17,0.16,0.16],[0.3,0.2,0.15,0.15,0.1,0.1]];
    return [];
  }

  // Pour chaque bucket, exploration unifiée solo + combos 2L→6L avec tie-break cote
  const result = {};
  Object.entries(buckets).forEach(([bucket, courses]) => {
    if (courses.length < 10) return;

    // Évaluation commune : filtre courses dégénérées, tri levier DESC + cote ASC, stats Top1/2/3
    function evalFormula(leviers, poids) {
      let n1 = 0, n2 = 0, n3 = 0, degen = 0;
      let coteSum = 0, wins = 0;
      courses.forEach(c => {
        const scoreOf = p => leviers.reduce((s, lv, i) => s + (p._levs[lv] || 0) * poids[i], 0);
        const scores = c.enriched.map(scoreOf);
        const minS = Math.min(...scores), maxS = Math.max(...scores);
        if (maxS - minS < 0.001) { degen++; return; }
        const sorted = [...c.enriched].sort((a, b) => {
          const diff = scoreOf(b) - scoreOf(a);
          if (Math.abs(diff) > 0.001) return diff;
          return (parseFloat(a.cote) || 999) - (parseFloat(b.cote) || 999);
        });
        if (sorted[0]?.arrivee === 1) { n1++; if (sorted[0].cote > 1) { coteSum += sorted[0].cote; wins++; } }
        if (sorted.slice(0, 2).some(p => p.arrivee === 1)) n2++;
        if (sorted.slice(0, 3).some(p => p.arrivee === 1)) n3++;
      });
      const t = courses.length - degen;
      return { n1, n2, n3, t, degen, pN1: t ? n1/t*100 : 0, pN2: t ? n2/t*100 : 0, pN3: t ? n3/t*100 : 0, avgCote: wins > 0 ? coteSum/wins : 0 };
    }

    // 1L — tous leviers solo
    const allFormulas = levierNames.map(name => ({ leviers: [name], poids: [1], n: 1, ...evalFormula([name], [1]) }));

    // Top 8 solos pour alimenter les combos (par Top1)
    const top8 = [...allFormulas].sort((a, b) => b.pN1 - a.pN1).slice(0, 8).map(r => r.leviers[0]);

    // 2L → 6L
    for (let sz = 2; sz <= Math.min(6, top8.length); sz++) {
      const levSets = combosOfSize(top8.slice(0, Math.min(sz + 2, 8)), sz);
      const ws = weightSets(sz);
      for (const levs of levSets)
        for (const w of ws)
          allFormulas.push({ leviers: levs, poids: w, n: sz, ...evalFormula(levs, w) });
    }

    // Champion : Top1 > Top2 > Top3 > simplicité (n ASC)
    allFormulas.sort((a, b) => {
      if (b.pN1 !== a.pN1) return b.pN1 - a.pN1;
      if (b.pN2 !== a.pN2) return b.pN2 - a.pN2;
      if (b.pN3 !== a.pN3) return b.pN3 - a.pN3;
      return a.n - b.n;
    });
    const champ = allFormulas[0];

    result[bucket] = {
      leviers: champ.leviers,
      poids: champ.poids,
      top1: champ.pN1,
      top2: champ.pN2,
      top3: champ.pN3,
      avgCote: champ.avgCote,
      courses: courses.length,
      coursesUtilisables: champ.t,
      degen: champ.degen,
    };
    _log(`  ${bucket}: ${champ.leviers.map((l,i) => l.split(' ')[0]+'×'+Math.round(champ.poids[i]*100)+'%').join(' + ')} → ${champ.pN1.toFixed(1)}% (${champ.n1}/${champ.t}, ${champ.degen} degen)`);
  });

  return result;
}

// Calculer la valeur d'un levier pour un participant
function getLevierValue(levierName, participant, ld) {
  const jk = (participant.jockey || '').toUpperCase().trim();
  const nom = extractNomCheval(participant.cheval);
  const entr = (participant.entraineur || participant['entraîneur'] || '').toUpperCase().trim();
  const j25 = fuzzyMatch(ld.jk25, jk);
  const j26 = fuzzyMatch(ld.jk26, jk);
  const ch25 = fuzzyMatch(ld.chx25, nom) || ld.chx25[nom];
  const ch26 = fuzzyMatch(ld.chx26, nom) || ld.chx26[nom];
  const cr25 = ld.cr25 ? fuzzyMatch(ld.cr25, jk) : null;
  const cr26 = ld.cr26 ? fuzzyMatch(ld.cr26, jk) : null;
  const coteVal = parseFloat(participant.cote) || 0;
  const coteRef = parseFloat(participant.cote_reference) || 0;
  const valeur = parseFloat(participant.valeur) || 0;
  const gains = parseInt(String(participant.gains || '').replace(/\D/g, '')) || 0;
  const nbC = parseInt(participant.nb_courses) || 0;
  const nbV = parseInt(participant.nb_victoires) || 0;
  const nbP = parseInt(participant.nb_places) || 0;
  const mxF = (a, b, f) => Math.max(a ? parseFloat(a[f]||0) : 0, b ? parseFloat(b[f]||0) : 0);
  const pop = {
    jk25: Object.keys(ld.jk25).length||1, jk26: Object.keys(ld.jk26).length||1,
    chx25: Object.keys(ld.chx25).length||1, chx26: Object.keys(ld.chx26).length||1,
    cr25: Object.keys(ld.cr25 || {}).length||1, cr26: Object.keys(ld.cr26 || {}).length||1,
  };
  const rS = (it, pp) => it ? 100*(1-(parseInt(it.Rang)-1)/pp) : 50;
  const bR = (a, pA, b, pB) => { const sa=a?rS(a,pA):null, sb=b?rS(b,pB):null; return sa!==null&&sb!==null?Math.max(sa,sb):sa??sb??50; };

  // Forme récente (chevaux_forme_recente.json) et Combo Jk×Entraîneur (combo_jockey_entraineur.json)
  const forme = (ld.forme || {})[nom];
  const comboKey = jk + '|||' + entr;
  const combo = (ld.combo || {})[comboKey];

  const map = {
    'Cote (1/cote)': coteVal>1?(1/coteVal)*100:50,
    'Cote ref': coteRef>1?(1/coteRef)*100:50,
    'Valeur FG': valeur>0?valeur:50,
    'Musique': (() => { const m=participant.musique; if(!m)return 50; const pos=m.replace(/\(\d+\)/g,'').match(/(\d+|[DRT])[a-z]/gi); if(!pos||pos.length<2)return 50; const l=pos.slice(0,5).map(x=>{const v=x.slice(0,-1);if('DRT'.includes(v))return 12;const n=parseInt(v);return n===0?12:n;}); let sc=0,w=0; l.forEach((ps,i)=>{const wt=(l.length-i)/l.length;const s=ps===1?100:ps===2?80:ps===3?65:ps<=5?45:ps<=8?25:10;sc+=s*wt;w+=wt;}); return w>0?sc/w:50; })(),
    'Gains (log)': gains > 0 ? Math.log10(gains) * 10 : 0,
    'TauxV indiv': nbC>=2?nbV/nbC*100:8,
    'TauxP indiv': nbC>=2?nbP/nbC*100:30,
    'NbVictoires': nbV*5,
    'Ch TauxV': mxF(ch25,ch26,'TauxVictoire')||8,
    'Ch TauxP': mxF(ch25,ch26,'TauxPlace')||30,
    'Ch Rang': bR(ch25,pop.chx25,ch26,pop.chx26),
    'Ch GainMoy': Math.max(ch25?.GainMoyen||0,ch26?.GainMoyen||0)>0?Math.log10(Math.max(ch25?.GainMoyen||0,ch26?.GainMoyen||0))*15:0,
    'Ch ScoreMixte': mxF(ch25,ch26,'ScoreMixte'),
    'Jk TauxV': mxF(j25,j26,'TauxVictoire')||8,
    'Jk TauxP': mxF(j25,j26,'TauxPlace')||30,
    'Jk Rang': bR(j25,pop.jk25,j26,pop.jk26),
    'Jk ScoreMixte': mxF(j25,j26,'ScoreMixte'),
    'Jk GainMoy': Math.max(j25?.GainMoyen||0,j26?.GainMoyen||0)>0?Math.log10(Math.max(j25?.GainMoyen||0,j26?.GainMoyen||0))*15:0,
    'Cravache Rang': bR(cr25, pop.cr25, cr26, pop.cr26),
    'Forme récente': forme ? forme.formeScore : 50,
    'Combo Jk*Ent': combo && combo.courses >= 3 ? combo.tauxVictoire : 10,
    'Dérive cote': coteVal>1&&coteRef>1 ? 50+(coteRef-coteVal)/coteRef*200 : 50,
  };

  // Calculs dérivés : leviers croisés (50/50) identiques à stats.html
  const _scoreCote = map['Cote (1/cote)'];
  const _deriveScore = map['Dérive cote'];
  const _scoreValeur = map['Valeur FG'];
  const _scoreMus = map['Musique'];
  const _chTauxV = map['Ch TauxV'];
  const _jkRang = map['Jk Rang'];
  map['Dérive × JkRang']   = _deriveScore * 0.5 + _jkRang * 0.5;
  map['Dérive × ChTauxV']  = _deriveScore * 0.5 + _chTauxV * 0.5;
  map['Dérive × Cote']     = _deriveScore * 0.5 + _scoreCote * 0.5;
  map['Cote × JkRang']     = _scoreCote * 0.5 + _jkRang * 0.5;
  map['Cote × ChTauxV']    = _scoreCote * 0.5 + _chTauxV * 0.5;
  map['Cote × Valeur']     = _scoreCote * 0.5 + _scoreValeur * 0.5;
  map['JkRang × ChTauxV']  = _jkRang * 0.5 + _chTauxV * 0.5;
  map['JkRang × Musique']  = _jkRang * 0.5 + _scoreMus * 0.5;
  map['Valeur × Musique']  = _scoreValeur * 0.5 + _scoreMus * 0.5;
  map['ChTauxV × Musique'] = _chTauxV * 0.5 + _scoreMus * 0.5;
  // Aussi gérer les combos pré-calculés
  const shortMap = {};
  Object.entries(map).forEach(([k,v]) => { shortMap[k] = v; shortMap[k.split(' ')[0]] = v; });
  return map[levierName] ?? shortMap[levierName] ?? 50;
}

// Pool "premium" : haut de gamme plat FR région parisienne + Normandie (Deauville en option).
// Critère : classements France Galop bien peuplés, cotes informatives, Groupes réguliers.
const PREMIUM_HIPPOS = new Set([
  'parislongchamp', 'longchamp',
  'saint-cloud', 'saint_cloud',
  'chantilly',
  'fontainebleau',
  'deauville',
]);

// Quel bucket fin correspond à une distance (aligné avec les FINE_RANGES de computeBestFormulasFromHistory)
function fineBucketForDistance(dist) {
  const d = parseInt(dist) || 0;
  if (d >= 900 && d <= 1099) return '1000m';
  if (d >= 1100 && d <= 1299) return '1200m';
  if (d >= 1300 && d <= 1399) return '1300m';
  if (d >= 1400 && d <= 1499) return '1400m';
  if (d >= 1500 && d <= 1599) return '1500m';
  if (d >= 1600 && d <= 1699) return '1600m';
  if (d >= 1700 && d <= 1899) return '1800m';
  if (d >= 1900 && d <= 2099) return '2000m';
  if (d >= 2100 && d <= 2199) return '2100m';
  if (d >= 2200 && d <= 2500) return '2400m';
  if (d >= 2600) return '3000m+';
  return null;
}

function getLevierScore(participant, distBucket, ld, hippo, rawDist) {
  const formulas = loadBestFormulas();
  const hippoKey = (hippo || '').toLowerCase();

  // Routage aligné avec stats.html : fine bucket > premium > coarse
  // - Fine : formule calculée sur la distance exacte (ex. "2400m") si dispo
  // - Premium : si hippo ∈ pool premium ET pas de fine meilleur
  // - Coarse : fallback toujours présent (sprint/mile/middle/staying)
  const fineKey = fineBucketForDistance(rawDist);
  const fineFormula = fineKey && formulas[fineKey]?.leviers ? formulas[fineKey] : null;
  const premiumFormula = PREMIUM_HIPPOS.has(hippoKey) && formulas.premium?.leviers ? formulas.premium : null;
  const coarseFormula = formulas[distBucket];

  let formula = null, formulaKey = distBucket, tag = '';
  if (fineFormula) {
    formula = fineFormula; formulaKey = fineKey; tag = `[${fineKey}] `;
  } else if (premiumFormula) {
    formula = premiumFormula; formulaKey = 'premium'; tag = '[PREMIUM] ';
  } else {
    formula = coarseFormula; formulaKey = distBucket; tag = '';
  }
  const usePremium = formulaKey === 'premium';

  // Seuil configurable : node live-scoring.js --seuil 90 longchamp C1
  const seuilArg = process.argv.find(a => a.startsWith('--seuil'));
  const seuilIdx = process.argv.indexOf('--seuil');
  const seuilTop1 = parseInt(seuilArg?.split('=')[1] || (seuilIdx >= 0 ? process.argv[seuilIdx + 1] : null)) || 100;
  // Seuil de courses : 15 pour fine (petits samples OK), 50 pour coarse/premium
  const minCourses = (fineKey && formulaKey === fineKey) ? 15 : 50;
  if (formula && formula.leviers && formula.poids && formula.courses >= minCourses && formula.top1 <= seuilTop1) {
    let score = 0;
    const label = tag + formula.leviers.map((l, i) => `${l.split(' ')[0]}×${(formula.poids[i]*100).toFixed(0)}%`).join(' + ');
    formula.leviers.forEach((lev, i) => {
      score += getLevierValue(lev, participant, ld) * formula.poids[i];
    });
    return { score, label };
  }

  // Formule conservatrice : mix de plusieurs leviers fiables
  // Cote (marché) + Ch TauxV (classement cheval) + Jk TauxP (classement jockey) + Musique
  const scoreCote = getLevierValue('Cote (1/cote)', participant, ld);
  const chTauxV = getLevierValue('Ch TauxV', participant, ld);
  const jkTauxP = getLevierValue('Jk TauxP', participant, ld);
  const musique = getLevierValue('Musique', participant, ld);

  if (distBucket === 'sprint')  return { score: chTauxV*0.3 + scoreCote*0.3 + jkTauxP*0.2 + musique*0.2, label: 'ChTauxV×30%+Cote×30%+JkTauxP×20%+Mus×20%' };
  if (distBucket === 'mile')    return { score: scoreCote*0.3 + chTauxV*0.25 + jkTauxP*0.25 + musique*0.2, label: 'Cote×30%+ChTauxV×25%+JkTauxP×25%+Mus×20%' };
  if (distBucket === 'middle')  return { score: scoreCote*0.3 + musique*0.25 + chTauxV*0.25 + jkTauxP*0.2, label: 'Cote×30%+Mus×25%+ChTauxV×25%+JkTauxP×20%' };
  if (distBucket === 'staying') return { score: musique*0.3 + scoreCote*0.25 + chTauxV*0.25 + jkTauxP*0.2, label: 'Mus×30%+Cote×25%+ChTauxV×25%+JkTauxP×20%' };
  return { score: scoreCote*0.3 + chTauxV*0.3 + jkTauxP*0.2 + musique*0.2, label: 'Cote×30%+ChTauxV×30%+JkTauxP×20%+Mus×20%' };
}

// ====================================================================
// MAIN
// ====================================================================
async function main() {
  const datePmu = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).split('/').join('');
  const dateISO = new Date().toISOString().split('T')[0];

  _log(`\n🏇 LIVE SCORING (100% code HTML) — ${dateISO}`);
_log('='.repeat(60));

  // Charger toutes les données de ranking-loader
_log('📊 Chargement des classements...');
  await rankingLoader.loadAllData();
  // Pré-calculer les formules leviers optimales
  loadBestFormulas();
_log('✅ Données chargées');

  // Filtrer par R/C ou par nom d'hippodrome + numéro de course
  // Usage : node live-scoring.js R1 C3
  //         node live-scoring.js salon C3
  //         node live-scoring.js longchamp C1
  //         node live-scoring.js salon       (toutes les courses de Salon)
  let filterR = null, filterC = null, filterHippo = null;
  const arg1 = (process.argv[2] || '').trim();
  const arg2 = (process.argv[3] || '').trim();

  if (arg1) {
    const mR = arg1.match(/^R(\d+)$/i);
    if (mR) { filterR = parseInt(mR[1]); }
    else { filterHippo = arg1.toUpperCase(); }
  }
  if (arg2) {
    const mC = arg2.match(/^C(\d+)$/i);
    if (mC) filterC = parseInt(mC[1]);
  }

  // Programme du jour
  const prog = await apiGet(`programme/${datePmu}?specialisation=INTERNET`);
  if (!prog) { console.log('❌ Pas de programme'); return; }

  for (const reunion of (prog.programme?.reunions || [])) {
    const rNum = reunion.numOfficiel || 0;
    if (filterR && rNum !== filterR) continue;
    const hippo = reunion.hippodrome?.libelleCourt || '?';
    if (filterHippo && !hippo.toUpperCase().includes(filterHippo)) continue;

    for (const course of (reunion.courses || [])) {
      const cNum = course.numOrdre || 0;
      if (filterC && cNum !== filterC) continue;

      const distance = course.distance || 0;
      const depart = course.heureDepart
        ? new Date(course.heureDepart + 7200000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
        : '?';

      await sleep(300);
      const pData = await apiGet(`programme/${datePmu}/R${rNum}/C${cNum}/participants?specialisation=INTERNET`);
      if (!pData) continue;

      const partants = (pData.participants || []).filter(p =>
        !p.estNonPartant && (p.statut || '').toUpperCase() !== 'NON_PARTANT'
      );
      if (!partants.length) continue;

      // Mapper au format ranking-loader.js
      const participants = partants.map(mapParticipant);

      // Construire le courseContext IDENTIQUE au HTML
      const courseContext = {
        distance: distance,
        type: (course.discipline || course.specialite || 'plat').toLowerCase() === 'plat' ? 'plat' : 'obstacle',
        participants: participants,
        hippodrome: hippo,
        date: dateISO,
      };

      // Appeler LE MÊME calculerScoresCourse que le HTML
      try {
        const scoresPredictifs = await rankingLoader.calculerScoresCourse(courseContext);

        if (!scoresPredictifs || !scoresPredictifs.length) {
_log(`\n⚠️ ${hippo} R${rNum}C${cNum} — pas de scores`);
          continue;
        }

        // Trier par score (DESC), cote ASC en tie-breaker pour éviter le biais ordre d'entrée
        const sorted = [...scoresPredictifs].sort((a, b) => {
          const diff = parseFloat(b.scorePredictif.score) - parseFloat(a.scorePredictif.score);
          if (Math.abs(diff) > 0.001) return diff;
          return (parseFloat(a.participant.cote) || 999) - (parseFloat(b.participant.cote) || 999);
        });

        const distLabel = distance < 1400 ? 'Sprint' : distance < 1700 ? 'Mile' : distance < 2200 ? 'Middle' : 'Staying';
        const distBucket = distLabel.toLowerCase();
_log(`\n${'━'.repeat(60)}`);
_log(`🏟️  ${hippo} R${rNum}C${cNum} — ${course.libelle || ''}`);
_log(`📏 ${distance}m (${distLabel}) | ⏰ ${depart} | 🐴 ${partants.length} partants`);

        // ── CLASSEMENT 1 : Modèle actuel ──
_log('━'.repeat(60));
_log(`📊 CLASSEMENT MODÈLE (formule actuelle)`);
_log(`${'#'.padStart(3)} ${'Cheval'.padEnd(22)} ${'Cote'.padStart(5)} ${'Score'.padStart(6)} ${'Fiab'.padStart(5)}`);
_log('─'.repeat(60));

        sorted.forEach((r, i) => {
          const p = r.participant;
          const s = r.scorePredictif;
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
          const cote = p.cote > 0 ? p.cote.toFixed(1) : '-';
          const fiab = s.indiceConfiance ? Math.round(parseFloat(s.indiceConfiance) * 100) + '%' : '-';
_log(`${medal}${String(p['n°'] || '').padStart(2)} ${(p.cheval || '').slice(0, 21).padEnd(22)} ${cote.padStart(5)} ${String(s.score).padStart(6)} ${fiab.padStart(5)}`);
        });

        // ── CLASSEMENT 2 : Leviers optimaux par distance ──
        const ld = getLevierData();
        const levierResults = participants.map(p => {
          const lr = getLevierScore(p, distBucket, ld, hippo, distance);
          return { ...p, _levScore: lr.score, _levLabel: lr.label };
        });
        levierResults.sort((a, b) => {
          const diff = b._levScore - a._levScore;
          if (Math.abs(diff) > 0.001) return diff;
          return (parseFloat(a.cote) || 999) - (parseFloat(b.cote) || 999);
        });
        // Normaliser 10-90
        const scores = levierResults.map(r => r._levScore);
        const minS = Math.min(...scores), maxS = Math.max(...scores);
        const rng = maxS - minS || 1;
        levierResults.forEach(r => { r._levNorm = ((r._levScore - minS) / rng * 80 + 10).toFixed(1); });

        // Vérifier fiabilité : formule basée sur combien de courses ?
        const formulas = loadBestFormulas();
        // Même routage que getLevierScore : fine > premium > coarse
        const fineKey = fineBucketForDistance(distance);
        const fineFormula = fineKey && formulas[fineKey]?.leviers ? formulas[fineKey] : null;
        const premiumFormula = PREMIUM_HIPPOS.has((hippo || '').toLowerCase()) && formulas.premium?.leviers ? formulas.premium : null;
        const formula = (fineFormula && fineFormula.courses >= 15) ? fineFormula
                      : (premiumFormula ? premiumFormula : formulas[distBucket]);
        const nbCoursesFormula = formula?.courses || 0;
        const fiable = nbCoursesFormula >= 30;

        if (fiable) {
_log(`\n🔬 CLASSEMENT LEVIERS (${levierResults[0]._levLabel}) — ${nbCoursesFormula} courses`);
        } else {
_log(`\n⚠️  CLASSEMENT LEVIERS (${levierResults[0]._levLabel}) — ${nbCoursesFormula} courses (< 30 = PEU FIABLE)`);
        }
_log(`${'#'.padStart(3)} ${'Cheval'.padEnd(22)} ${'Cote'.padStart(5)} ${'Score'.padStart(6)}`);
_log('─'.repeat(60));
        levierResults.forEach((p, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
          const cote = p.cote > 0 ? p.cote.toFixed(1) : '-';
_log(`${medal}${String(p['n°'] || '').padStart(2)} ${(p.cheval || '').slice(0, 21).padEnd(22)} ${cote.padStart(5)} ${String(p._levNorm).padStart(6)}`);
        });

        // Comparer les deux classements
        const top1Modele = sorted[0]?.participant?.['n°'];
        const top1Levier = levierResults[0]?.['n°'];
        if (top1Modele !== top1Levier) {
_log(`\n⚡ Top1 différent : Modèle=#${top1Modele} vs Leviers=#${top1Levier}${!fiable ? ' (levier peu fiable, préférer Modèle)' : ''}`);
        } else {
_log(`\n🤝 Top1 identique : #${top1Modele} (les 2 classements concordent)`);
        }

        // Comparer au favori
        const byCote = sorted.filter(r => r.participant.cote > 1).sort((a, b) => a.participant.cote - b.participant.cote);
        const notre1 = sorted[0];
        if (byCote.length && byCote[0].participant['n°'] !== notre1.participant['n°']) {
_log(`\n⭐ Favori: #${byCote[0].participant['n°']} ${(byCote[0].participant.cheval || '').slice(0, 20)} (cote ${byCote[0].participant.cote})`);
_log(`🎯 Notre #1: #${notre1.participant['n°']} ${(notre1.participant.cheval || '').slice(0, 20)} (cote ${notre1.participant.cote})`);
_log(`   → DIVERGENCE = potentiel VALUE`);
        } else if (byCote.length) {
_log(`\n✅ Notre #1 = Favori: #${notre1.participant['n°']} ${(notre1.participant.cheval || '').slice(0, 20)}`);
        }

        // Simulation Dutch — 5€, min 1€/cheval, net TOUJOURS positif
        // Tester de 4 chevaux jusqu'à 2 (consécutifs depuis le top)
        // Garder la meilleure config où TOUS les nets sont > 0
        const BUDGET = 5;
        let bestConfig = null;

        for (let nb = Math.min(4, sorted.length); nb >= 2; nb--) {
          const chevaux = sorted.slice(0, nb).filter(r => r.participant.cote > 1);
          if (chevaux.length < nb) continue;

          const cotes = chevaux.map(r => r.participant.cote);
          const sumInv = cotes.reduce((s, c) => s + 1/c, 0);

          // Dutch betting : si sum(1/cote) >= 1, impossible d'avoir tous nets positifs
          if (sumInv >= 1) continue;

          // Mises Dutch optimales : mise_i = BUDGET / (cote_i × sum(1/cote_j))
          let mises = cotes.map(c => BUDGET / (c * sumInv));

          // Arrondir à 0.50€ (step PMU), minimum 1€
          mises = mises.map(m => Math.max(1, Math.round(m * 2) / 2));
          let total = mises.reduce((a, b) => a + b, 0);

          // Ajuster pour coller au budget : ajouter/retirer 0.5€ au cheval avec la plus grosse cote
          while (total < BUDGET) { mises[mises.length - 1] += 0.5; total += 0.5; }
          while (total > BUDGET && mises[0] > 1) { mises[0] -= 0.5; total -= 0.5; }
          // Si toujours pas 5€, ajuster le premier
          if (total !== BUDGET) mises[0] = +(mises[0] + BUDGET - total).toFixed(1);

          // Vérifier que TOUS les nets sont positifs
          const allPositive = mises.every((m, i) => m * cotes[i] > BUDGET);
          if (!allPositive) continue;

          // Calculer le gain net minimum
          const nets = mises.map((m, i) => +(m * cotes[i] - BUDGET).toFixed(1));
          const minNet = Math.min(...nets);

          bestConfig = { chevaux, cotes, mises, nets, minNet, nb };
          break; // Prendre le max de chevaux possible
        }

        if (bestConfig) {
          const { chevaux, mises, nets, nb } = bestConfig;
_log(`\n💰 DUTCH TOP ${nb} — Mise ${BUDGET}€ (net TOUJOURS positif)`);
_log('─'.repeat(60));
          chevaux.forEach((r, i) => {
            const p = r.participant;
            const gain = (mises[i] * p.cote).toFixed(1);
            const netStr = nets[i] >= 0 ? `\x1b[32m+${nets[i].toFixed(1)}€\x1b[0m` : `\x1b[31m${nets[i].toFixed(1)}€\x1b[0m`;
_log(`  #${String(p['n°']).padStart(2)} ${(p.cheval || '').slice(0, 18).padEnd(19)} cote ${String(p.cote.toFixed(1)).padStart(5)} → mise ${String(mises[i].toFixed(1)).padStart(4)}€ → gain ${gain.padStart(6)}€ (net ${netStr})`);
          });
_log('─'.repeat(60));
_log(`  ✅ Net min: +${bestConfig.minNet.toFixed(1)}€ | N'importe lequel des ${nb} gagne = profit`);
        } else {
          // Aucune config Dutch possible → fallback 2 chevaux
          const top2 = sorted.slice(0, 2).filter(r => r.participant.cote > 1);
          if (top2.length === 2) {
            const c1 = top2[0].participant.cote, c2 = top2[1].participant.cote;
            // Mise minimale pour net positif : mise × cote > budget
            // Chercher le budget max qui marche avec 2 chevaux
            const m1 = Math.max(1, Math.ceil(BUDGET / c1 * 2) / 2);
            const m2 = Math.max(1, BUDGET - m1);
_log(`\n💰 TOP 2 — Cotes trop basses pour Dutch 4`);
_log('─'.repeat(60));
            top2.forEach((r, i) => {
              const p = r.participant;
              const m = i === 0 ? m1 : m2;
              const gain = (m * p.cote).toFixed(1);
              const net = (m * p.cote - BUDGET).toFixed(1);
_log(`  #${String(p['n°']).padStart(2)} ${(p.cheval || '').slice(0, 18).padEnd(19)} cote ${String(p.cote.toFixed(1)).padStart(5)} → mise ${String(m.toFixed(1)).padStart(4)}€ → gain ${gain.padStart(6)}€ (net ${net > 0 ? '+' : ''}${net}€)`);
            });
_log('─'.repeat(60));
_log(`  ⚠️  Cotes basses — vérifier que les nets sont positifs`);
          }
        }

      } catch (err) {
        _log(`❌ Erreur scoring R${rNum}C${cNum}:`, err.message);
      }
    }
  }
_log(`\n${'='.repeat(60)}\nTerminé.`);
}

main().catch(err => { console.error(err); process.exit(1); });
