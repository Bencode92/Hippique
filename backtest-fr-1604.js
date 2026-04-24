#!/usr/bin/env node
/**
 * Backtest walk-forward — courses FR uniquement — 2026-04-16 → aujourd'hui
 * Snapshots datés utilisés pour éviter toute fuite de données.
 * Logique de scoring identique à stats.html (computeLeviers).
 */

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, 'data');
const FROM = process.argv[2] || '2026-04-16';
const TO   = process.argv[3] || new Date().toISOString().slice(0, 10);

const FR_HIPPOS = new Set([
  'enghien', 'parislongchamp', 'salon_de_provence',
  'borely', 'la_cepiere', 'saint-cloud', 'tarbes', 'vincennes',
  'lyon-parilly', 'strasbourg',
  'agen_la_garenne', 'auteuil', 'la_capelle', 'nancy-brabois',
  'feurs', 'fontainebleau', 'le_croise_laroche', 'le_lion_dangers',
  'compiegne', 'le_mans',
  'chantilly', 'chateaubriant', 'la_teste',
  'laval', 'reims',
]);

function loadJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function buildMap(data, keyField) {
  const m = {};
  if (!data?.resultats) return m;
  const list = Array.isArray(data.resultats) ? data.resultats : Object.entries(data.resultats).map(([k, v]) => ({ _key: k, ...v }));
  list.forEach(item => { const k = (item[keyField] || item._key || '').toUpperCase().trim(); if (k) m[k] = item; });
  return m;
}

// Correspondances pré-calculées (claude_correspondances.json)
const corresp = loadJson(`${DATA}/claude_correspondances.json`) || {};
const correspMap = {};  // raw → canonical
for (const [raw, info] of Object.entries(corresp.correspondances || {})) {
  correspMap[raw.toUpperCase().trim()] = (info.match || '').toUpperCase().trim();
}
const knownForeign = new Set((corresp.etrangers || []).map(s => s.toUpperCase().trim()));

// Fuzzy match : "C. DEMURO" ou "DEMURO C." → "CRISTIAN DEMURO"
// Extrait depuis live-scoring.js:168-198
function fuzzyMatch(map, shortName) {
  if (!shortName || shortName.length < 3) return null;
  const key = shortName.toUpperCase().trim();
  if (map[key]) return map[key];

  // Check pre-computed correspondences
  if (correspMap[key] && map[correspMap[key]]) return map[correspMap[key]];

  // Skip known foreigners
  if (knownForeign.has(key)) return null;

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

// ---- Données stables (2025 + forme + combo) ----
const chx25 = buildMap(loadJson(`${DATA}/chevaux_2025_ponderated_latest.json`), 'Nom');
const jk25  = buildMap(loadJson(`${DATA}/jockeys_2025_ponderated_latest.json`),  'NomPostal');
const cr25  = buildMap(loadJson(`${DATA}/cravache_or_2025_ponderated_latest.json`), 'NomPostal');
const forme = loadJson(`${DATA}/chevaux_forme_recente.json`)?.resultats || {};
const comboDb = loadJson(`${DATA}/combo_jockey_entraineur.json`)?.resultats || {};

// ---- Snapshots datés 2026 ----
const snapDirs = fs.readdirSync(`${DATA}/rankings`).filter(n => /^\d{4}-\d{2}-\d{2}/.test(n)).sort();
const snapshots = snapDirs.map(name => ({
  name,
  date: name.slice(0, 10),
  chx: buildMap(loadJson(`${DATA}/rankings/${name}/chevaux.json`),      'Nom'),
  jk:  buildMap(loadJson(`${DATA}/rankings/${name}/jockeys.json`),      'NomPostal'),
  cr:  buildMap(loadJson(`${DATA}/rankings/${name}/cravache_or.json`),  'NomPostal'),
}));
console.log(`📸 ${snapshots.length} snapshots chargés: ${snapDirs.join(', ')}`);

function getSnapshot(courseDate) {
  let best = null;
  for (const s of snapshots) {
    if (s.date <= courseDate) best = s; else break;
  }
  return best;
}

// ---- Logique de scoring (extraite de stats.html:computeLeviers) ----
function extractNom(cheval) {
  return (cheval || '').replace(/\s+[MFH]\.\w*\.?\s*\d+\s*a\.?\s*$/i, '').trim().toUpperCase();
}

function parseMusique(m) {
  if (!m) return 50;
  const pos = m.replace(/\(\d+\)/g, '').match(/(\d+|[DRT])[a-z]/gi);
  if (!pos || pos.length < 2) return 50;
  const l = pos.slice(0, 5).map(x => {
    const v = x.slice(0, -1);
    if ('DRT'.includes(v)) return 12;
    const n = parseInt(v);
    return n === 0 ? 12 : n;
  });
  let sc = 0, w = 0;
  l.forEach((ps, i) => {
    const wt = (l.length - i) / l.length;
    const s = ps === 1 ? 100 : ps === 2 ? 80 : ps === 3 ? 65 : ps <= 5 ? 45 : ps <= 8 ? 25 : 10;
    sc += s * wt; w += wt;
  });
  return w > 0 ? sc / w : 50;
}

const popCache = new Map();
function getPop(snap) {
  if (!popCache.has(snap.name)) {
    popCache.set(snap.name, {
      chx25: Object.keys(chx25).length || 1,
      chx26: Object.keys(snap.chx).length || 1,
      jk25:  Object.keys(jk25).length  || 1,
      jk26:  Object.keys(snap.jk).length  || 1,
      cr25:  Object.keys(cr25).length  || 1,
      cr26:  Object.keys(snap.cr).length  || 1,
    });
  }
  return popCache.get(snap.name);
}

function computeLeviers(p, snap) {
  const nom = extractNom(p.cheval);
  const jk  = (p.jockey || '').toUpperCase().trim();
  const entr = (p.entraineur || p['entraîneur'] || '').toUpperCase().trim();
  const coteVal = parseFloat(p.cote) || 0;
  const valeur  = parseFloat(p.valeur) || 0;
  const gains   = parseInt(String(p.gains || '').replace(/\D/g, '')) || 0;
  const nbC = parseInt(p.nb_courses)   || 0;
  const nbV = parseInt(p.nb_victoires) || 0;
  const nbP = parseInt(p.nb_places)    || 0;

  // Fuzzy match pour chevaux + jockeys + cravache (gère "M.GRANDIN" → "MARVIN GRANDIN")
  const ch25i = fuzzyMatch(chx25, nom)   || chx25[nom];
  const j25i  = fuzzyMatch(jk25,  jk)    || jk25[jk];
  const cr25i = fuzzyMatch(cr25,  jk)    || cr25[jk];
  const ch26  = fuzzyMatch(snap.chx, nom) || snap.chx[nom];
  const j26   = fuzzyMatch(snap.jk,  jk)  || snap.jk[jk];
  const cr26  = fuzzyMatch(snap.cr,  jk)  || snap.cr[jk];

  const pop = getPop(snap);
  const mxF = (a, b, f) => Math.max(a ? parseFloat(a[f] || 0) : 0, b ? parseFloat(b[f] || 0) : 0);
  const rS  = (it, pp) => it ? 100 * (1 - (parseInt(it.Rang) - 1) / pp) : 50;
  const bR  = (a, pA, b, pB) => {
    const sa = a ? rS(a, pA) : null, sb = b ? rS(b, pB) : null;
    if (sa !== null && sb !== null) return Math.max(sa, sb);
    return sa !== null ? sa : (sb !== null ? sb : 50);
  };

  const f = forme[nom];
  const comboKey = jk + '|||' + entr;
  const cb = comboDb[comboKey];

  const scoreCote   = coteVal > 1 ? (1 / coteVal) * 100 : 50;
  const scoreValeur = valeur > 0 ? valeur : 50;
  const scoreMus    = parseMusique(p.musique);

  // Flags utilisés pour détecter les courses « dégénérées » (pas de données réelles)
  const _jkKnown = !!(j25i || j26);
  const _chKnown = !!(ch25i || ch26);

  return {
    _flags: { jkKnown: _jkKnown, chKnown: _chKnown },
    'Cote':            scoreCote,
    'Valeur FG':       scoreValeur,
    'Musique':         scoreMus,
    'Gains log':       gains > 0 ? Math.log10(gains) * 10 : 0,
    'TauxV indiv':     nbC >= 2 ? nbV / nbC * 100 : 8,
    'TauxP indiv':     nbC >= 2 ? nbP / nbC * 100 : 30,
    'Ch TauxV':        mxF(ch25i, ch26, 'TauxVictoire') || 8,
    'Ch TauxP':        mxF(ch25i, ch26, 'TauxPlace')    || 30,
    'Ch Rang':         bR(ch25i, pop.chx25, ch26, pop.chx26),
    'Ch ScoreMixte':   mxF(ch25i, ch26, 'ScoreMixte'),
    'Jk TauxV':        mxF(j25i, j26, 'TauxVictoire') || 8,
    'Jk TauxP':        mxF(j25i, j26, 'TauxPlace')    || 30,
    'Jk Rang':         bR(j25i, pop.jk25, j26, pop.jk26),
    'Jk ScoreMixte':   mxF(j25i, j26, 'ScoreMixte'),
    'Cravache Rang':   bR(cr25i, pop.cr25, cr26, pop.cr26),
    'Forme récente':   f ? f.formeScore : 50,
    'Combo Jk×Ent':    cb && cb.courses >= 3 ? cb.tauxVictoire : 10,
    // Combos utiles
    'Cote×ChTauxV':    scoreCote * 0.5 + (mxF(ch25i, ch26, 'TauxVictoire') || 8) * 0.5,
    'Cote×JkRang':     scoreCote * 0.5 + bR(j25i, pop.jk25, j26, pop.jk26) * 0.5,
    'Cote×Musique':    scoreCote * 0.5 + scoreMus * 0.5,
    'JkRang×ChTauxV':  bR(j25i, pop.jk25, j26, pop.jk26) * 0.5 + (mxF(ch25i, ch26, 'TauxVictoire') || 8) * 0.5,
    'Musique×ChTauxV': scoreMus * 0.5 + (mxF(ch25i, ch26, 'TauxVictoire') || 8) * 0.5,
  };
}

// ---- Charger les courses FR ----
const courseFiles = fs.readdirSync(`${DATA}/courses`).filter(f => {
  if (!f.endsWith('.json')) return false;
  const d = f.slice(0, 10);
  const hippo = f.slice(11, -5);
  return d >= FROM && d <= TO && FR_HIPPOS.has(hippo);
}).sort();

function distBucket(m) { return m < 1400 ? 'sprint' : m < 1700 ? 'mile' : m < 2200 ? 'middle' : 'staying'; }

const allCourses = [];
const skipLog = { no_snapshot: 0, no_winner: 0, few_cotes: 0, few_parts: 0 };
for (const f of courseFiles) {
  const d = f.slice(0, 10);
  const hippo = f.slice(11, -5);
  const data = loadJson(`${DATA}/courses/${f}`);
  if (!data) continue;
  const snap = getSnapshot(d);
  if (!snap) { skipLog.no_snapshot++; continue; }
  for (const cr of data.courses || []) {
    const parts = cr.participants || [];
    if (parts.length < 3) { skipLog.few_parts++; continue; }
    if (!parts.some(p => p.arrivee === 1)) { skipLog.no_winner++; continue; }
    const withCote = parts.filter(p => parseFloat(p.cote) > 1);
    if (withCote.length < 3) { skipLog.few_cotes++; continue; }

    const enriched = parts.map(p => ({ ...p, _lev: computeLeviers(p, snap) }));
    const dist = parseInt(cr.distance) || 0;
    const parCote = [...enriched].filter(p => parseFloat(p.cote) > 1).sort((a, b) => parseFloat(a.cote) - parseFloat(b.cote));

    // Couverture rankings
    const jkCov = enriched.filter(p => p._lev._flags.jkKnown).length / enriched.length;
    const chCov = enriched.filter(p => p._lev._flags.chKnown).length / enriched.length;

    allCourses.push({
      file: f, date: d, hippo, nom: cr.nom, dist, dl: distBucket(dist),
      parts: enriched, parCote, snapUsed: snap.name,
      jkCov, chCov,
    });
  }
}

console.log(`\n📂 ${courseFiles.length} meetings FR, ${allCourses.length} courses chargées`);
console.log(`   Skippées: ${JSON.stringify(skipLog)}`);

// ---- Couverture rankings ----
const avgJkCov = allCourses.reduce((s, c) => s + c.jkCov, 0) / allCourses.length;
const avgChCov = allCourses.reduce((s, c) => s + c.chCov, 0) / allCourses.length;
console.log(`   Couverture Jockeys rankings: ${(avgJkCov*100).toFixed(0)}%   Chevaux: ${(avgChCov*100).toFixed(0)}%`);

// ---- Évaluation ----
const levierNames = Object.keys(allCourses[0].parts[0]._lev).filter(k => k !== '_flags');

function evalLevier(courses, name) {
  let n1 = 0, n2 = 0, n3 = 0, degen = 0;
  let coteSum = 0, wins = 0;
  courses.forEach(c => {
    const scores = c.parts.map(p => p._lev[name] || 0);
    const min = Math.min(...scores), max = Math.max(...scores);
    if (max - min < 0.001) { degen++; return; }
    const sorted = [...c.parts].sort((a, b) => (b._lev[name] || 0) - (a._lev[name] || 0));
    if (sorted[0]?.arrivee === 1) { n1++; if (sorted[0].cote > 1) { coteSum += sorted[0].cote; wins++; } }
    if (sorted.slice(0, 2).some(p => p.arrivee === 1)) n2++;
    if (sorted.slice(0, 3).some(p => p.arrivee === 1)) n3++;
  });
  const t = courses.length - degen;
  return { name, n1, n2, n3, t, degen, pN1: t ? n1/t*100 : 0, pN2: t ? n2/t*100 : 0, pN3: t ? n3/t*100 : 0, avgCote: wins > 0 ? coteSum/wins : 0 };
}

function evalFav(courses) {
  let f1 = 0, f2 = 0, f3 = 0;
  let coteSum = 0, wins = 0;
  courses.forEach(c => {
    if (c.parCote[0]?.arrivee === 1) { f1++; if (c.parCote[0].cote > 1) { coteSum += c.parCote[0].cote; wins++; } }
    if (c.parCote.slice(0, 2).some(p => p.arrivee === 1)) f2++;
    if (c.parCote.slice(0, 3).some(p => p.arrivee === 1)) f3++;
  });
  const t = courses.length;
  return { t, pF1: t ? f1/t*100 : 0, pF2: t ? f2/t*100 : 0, pF3: t ? f3/t*100 : 0, avgCote: wins > 0 ? coteSum/wins : 0 };
}

function printTable(title, rows, fav) {
  console.log(`\n━━━ ${title} ━━━`);
  console.log(`Favori cote baseline : Top1=${fav.pF1.toFixed(1)}%  Top2=${fav.pF2.toFixed(1)}%  Top3=${fav.pF3.toFixed(1)}%  avgCote=${fav.avgCote.toFixed(2)}  (n=${fav.t})`);
  console.log(`Levier                         | Top1%  Top2%  Top3%  Δvs fav  avgCote  n (degen)`);
  console.log(`-------------------------------|-----------------------------------------------------`);
  rows.sort((a, b) => b.pN1 - a.pN1);
  rows.forEach(r => {
    const diff = (r.pN1 - fav.pF1).toFixed(1);
    const sign = r.pN1 >= fav.pF1 ? '+' : '';
    console.log(
      `${r.name.padEnd(30)} | ${r.pN1.toFixed(1).padStart(5)}  ${r.pN2.toFixed(1).padStart(5)}  ${r.pN3.toFixed(1).padStart(5)}  ${(sign+diff).padStart(6)}pp  ${r.avgCote.toFixed(2).padStart(6)}   ${r.t} (${r.degen})`
    );
  });
}

// ---- Global ----
const fav = evalFav(allCourses);
const rows = levierNames.map(n => evalLevier(allCourses, n));
printTable(`GLOBAL (toutes distances, tous hippodromes FR) — ${FROM} → ${TO}`, rows, fav);

// ---- Par bucket de distance ----
const buckets = { sprint: [], mile: [], middle: [], staying: [] };
allCourses.forEach(c => buckets[c.dl].push(c));
for (const [b, list] of Object.entries(buckets)) {
  if (list.length < 5) { console.log(`\n(${b}: ${list.length} courses — trop peu, skipped)`); continue; }
  const f2 = evalFav(list);
  const r2 = levierNames.map(n => evalLevier(list, n));
  printTable(`BUCKET ${b.toUpperCase()} (n=${list.length})`, r2, f2);
}

// ---- Récap par hippo ----
console.log(`\n━━━ Récap par hippodrome ━━━`);
const byHippo = {};
allCourses.forEach(c => { (byHippo[c.hippo] ||= []).push(c); });
const hippoSorted = Object.entries(byHippo).sort((a,b)=>b[1].length-a[1].length);
hippoSorted.forEach(([h, list]) => {
  console.log(`  ${h.padEnd(25)} ${list.length.toString().padStart(3)} courses — jkCov=${(list.reduce((s,c)=>s+c.jkCov,0)/list.length*100).toFixed(0)}% chCov=${(list.reduce((s,c)=>s+c.chCov,0)/list.length*100).toFixed(0)}%`);
});

// ---- Détail course par course (meilleur levier global) ----
rows.sort((a,b)=>b.pN1-a.pN1);
const bestLev = rows[0].name;
console.log(`\n━━━ Détail course par course — meilleur levier: ${bestLev} ━━━`);
console.log(`Date       | Hippo                | Course                          | Dist | #1 prédit          cote | Gagnant              cote | Fav | Levier`);
console.log(`-----------|----------------------|---------------------------------|------|-------------------------|----------------------------|-----|-------`);
allCourses.forEach(c => {
  const scores = c.parts.map(p => p._lev[bestLev] || 0);
  const min = Math.min(...scores), max = Math.max(...scores);
  const degen = max - min < 0.001;
  const sorted = [...c.parts].sort((a,b) => (b._lev[bestLev]||0) - (a._lev[bestLev]||0));
  const top1 = sorted[0];
  const winner = c.parts.find(p => p.arrivee === 1);
  const fav1 = c.parCote[0];
  const okL = top1?.arrivee === 1;
  const okF = fav1?.arrivee === 1;
  console.log(
    `${c.date} | ${c.hippo.padEnd(20)} | ${(c.nom||'').slice(0,31).padEnd(31)} | ${String(c.dist).padStart(4)} | #${(top1?.['n°']||'?').toString().padStart(2)} ${(top1?.cheval||'').slice(0,15).padEnd(15)} ${(top1?.cote||'-').toString().padStart(5)} | #${(winner?.['n°']||'?').toString().padStart(2)} ${(winner?.cheval||'').slice(0,15).padEnd(15)} ${(winner?.cote||'-').toString().padStart(5)} | ${okF?'✓':' '}  | ${degen?'DEG':(okL?'✓':'·')}`
  );
});
