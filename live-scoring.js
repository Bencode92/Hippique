#!/usr/bin/env node
/**
 * LIVE SCORING — 100% identique au HTML
 * Utilise le MÊME code que ranking-loader.js
 *
 * Usage : node live-scoring.js          → toutes les courses cibles
 *         node live-scoring.js R1 C3    → course spécifique
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://online.turfinfo.api.pmu.fr/rest/client/61';

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

// Charger le ranking-loader.js et extraire les fonctions de scoring
// On simule l'environnement navigateur minimal
function loadRankingLoader() {
  // Charger les classements
  const load = (f, key) => {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
      const m = {};
      (d.resultats || []).forEach(i => { const k = (i[key] || '').toUpperCase().trim(); if (k) m[k] = i; });
      return { map: m, total: d.resultats?.length || 1 };
    } catch (e) { return { map: {}, total: 1 }; }
  };

  return {
    ch25: load('chevaux_2025_ponderated_latest.json', 'Nom'),
    ch26: load('chevaux_ponderated_latest.json', 'Nom'),
    j25: load('jockeys_2025_ponderated_latest.json', 'NomPostal'),
    j26: load('jockeys_ponderated_latest.json', 'NomPostal'),
  };
}

function matchInit(map, nom) {
  if (!nom || nom.length < 3) return null;
  const n = nom.toUpperCase().trim();
  if (map[n]) return map[n];
  const cleaned = n.replace(/^MME\s+|^MLLE\s+/i, '');
  const m = cleaned.match(/^([A-Z]{1,3})\.?\s*(.+?)(?:\s*\(.*\))?$/);
  if (!m) return null;
  const init = m[1].charAt(0);
  let fam = m[2].trim().replace(/\s*\([A-Z]\)\s*$/, '').trim();
  if (fam.length < 3) return null;
  for (const [k, v] of Object.entries(map)) {
    if ((k.endsWith(fam) || k.includes(' ' + fam)) && k.replace(fam, '').replace(/^MME\s+/i, '').trim().charAt(0) === init) return v;
  }
  return null;
}

function parseMusique(m) {
  if (!m) return 50;
  const positions = m.replace(/\(\d+\)/g, '').match(/(\d+|[DRT])[a-z]/gi);
  if (!positions || positions.length < 2) return 50;
  const last5 = positions.slice(0, 5).map(x => { const v = x.slice(0, -1); if ('DRT'.includes(v)) return 12; const n = parseInt(v); return n === 0 ? 12 : n; });
  let sc = 0, w = 0;
  last5.forEach((pos, i) => { const wt = (last5.length - i) / last5.length; const ps = pos === 1 ? 100 : pos === 2 ? 80 : pos === 3 ? 65 : pos <= 5 ? 45 : pos <= 8 ? 25 : 10; sc += ps * wt; w += wt; });
  return w > 0 ? sc / w : 50;
}

// === FORMULE 100% IDENTIQUE À ranking-loader.js ===
function scoreParticipant(p, dist, nbPartants, lk, isToday) {
  const maxScore = 100;
  const chName = (p.nom || '').toUpperCase().trim();
  const jName = (typeof p.driver === 'string' ? p.driver : p.driver?.nom || '').toUpperCase().trim();

  // Chercher cheval 2025 + 2026 (identique à ranking-loader.js)
  const itemCh25 = lk.ch25.map[chName] || null;
  const itemCh26 = isToday ? (lk.ch26.map[chName] || null) : null;
  const tv25 = itemCh25 ? parseFloat(itemCh25.TauxVictoire || 0) : null;
  const tv26 = itemCh26 ? parseFloat(itemCh26.TauxVictoire || 0) : null;
  const tauxVCh25 = tv25 !== null && tv26 !== null ? Math.max(tv25, tv26)
    : tv25 !== null ? tv25 : tv26 !== null ? tv26 : 8;

  // Jockey
  const itemJ25 = matchInit(lk.j25.map, jName);
  const itemJ26 = isToday ? matchInit(lk.j26.map, jName) : null;
  const scoreJ25 = itemJ25 ? maxScore * (1 - (parseInt(itemJ25.Rang) - 1) / Math.max(lk.j25.total, 1)) : null;
  const scoreJ26 = itemJ26 ? maxScore * (1 - (parseInt(itemJ26.Rang) - 1) / Math.max(lk.j26.total, 1)) : null;
  const scoreJockey25 = scoreJ25 !== null && scoreJ26 !== null ? Math.max(scoreJ25, scoreJ26)
    : scoreJ25 !== null ? scoreJ25 : scoreJ26 !== null ? scoreJ26 : 50;

  // Cote
  const rd = p.dernierRapportDirect || {};
  const rr = p.dernierRapportReference || {};
  const coteVal = (typeof rd === 'object' ? rd.rapport : 0) || 0;
  const coteRef = (typeof rr === 'object' ? rr.rapport : 0) || 0;
  const scoreCote = coteVal > 1 ? (1 / coteVal) * 100 : 50;

  // Valeur FG
  const valeurFG = p.handicapPoids ? p.handicapPoids / 10 : 0;
  const scoreValeur = valeurFG > 0 ? valeurFG : 50;

  // Musique
  const scoreMusique = parseMusique(p.musique || '');

  // IndivV
  const nbC = p.nombreCourses || 0;
  const nbV = p.nombreVictoires || 0;

  // Distance bucket
  const distBucket = dist < 1400 ? 'sprint' : dist < 1700 ? 'mile' : dist < 2200 ? 'middle' : 'staying';
  const fieldBucket = nbPartants < 9 ? 'small' : nbPartants < 14 ? 'medium' : 'large';

  // === FORMULES IDENTIQUES À ranking-loader.js ===
  let scoreFinal;
  if (distBucket === 'sprint') {
    scoreFinal = scoreMusique * 0.4 + scoreCote * 0.4 + scoreValeur * 0.2;
  } else if (distBucket === 'mile') {
    scoreFinal = scoreValeur * 0.5 + scoreCote * 0.3 + scoreMusique * 0.2;
  } else if (distBucket === 'middle') {
    const indivV = nbC >= 2 ? (nbV / nbC) * 100 : 8;
    scoreFinal = scoreCote * 0.5 + scoreValeur * 0.3 + indivV * 0.2;
  } else {
    scoreFinal = scoreCote * 0.4 + scoreValeur * 0.3 + scoreMusique * 0.3;
  }

  // Ajustement peloton (identique)
  if (fieldBucket === 'small') {
    scoreFinal += scoreValeur * 0.15;
  } else if (fieldBucket === 'large') {
    scoreFinal += tauxVCh25 * 0.3;
  }

  // Dérive
  let derive = '';
  if (coteVal > 1 && coteRef > 1) {
    const pct = Math.round((coteVal / coteRef - 1) * 100);
    if (Math.abs(pct) > 5) derive = `${pct > 0 ? '↑' : '↓'}${pct > 0 ? '+' : ''}${pct}%`;
  }

  return {
    num: p.numPmu || '?', nom: chName, jockey: jName,
    cote: coteVal, coteRef, derive,
    valeur: valeurFG, musScore: Math.round(scoreMusique),
    score: scoreFinal, distBucket, fieldBucket,
    favori: rd.favoris || false,
  };
}

async function main() {
  const datePmu = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).split('/').join('');
  const dateISO = new Date().toISOString().split('T')[0];

  console.log(`\n🏇 LIVE SCORING (100% identique au HTML) — ${dateISO}`);
  console.log('='.repeat(60));

  const lk = loadRankingLoader();
  console.log(`📊 ${Object.keys(lk.ch25.map).length} chevaux 2025, ${Object.keys(lk.ch26.map).length} chevaux 2026`);

  const prog = await apiGet(`programme/${datePmu}?specialisation=INTERNET`);
  if (!prog) { console.log('❌ Pas de programme'); return; }

  // Filtrer R/C
  let filterR = null, filterC = null;
  if (process.argv[2]) { const m = process.argv[2].match(/R(\d+)/i); if (m) filterR = parseInt(m[1]); }
  if (process.argv[3]) { const m = process.argv[3].match(/C(\d+)/i); if (m) filterC = parseInt(m[1]); }

  for (const reunion of (prog.programme?.reunions || [])) {
    const rNum = reunion.numOfficiel || 0;
    if (filterR && rNum !== filterR) continue;
    const hippo = reunion.hippodrome?.libelleCourt || '?';

    for (const course of (reunion.courses || [])) {
      const cNum = course.numOrdre || 0;
      if (filterC && cNum !== filterC) continue;
      const distance = course.distance || 0;
      const depart = course.heureDepart ? new Date(course.heureDepart + 7200000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h') : '?';

      await sleep(300);
      const pData = await apiGet(`programme/${datePmu}/R${rNum}/C${cNum}/participants?specialisation=INTERNET`);
      if (!pData) continue;

      const partants = (pData.participants || []).filter(p => !p.estNonPartant && (p.statut || '').toUpperCase() !== 'NON_PARTANT');
      if (!partants.length) continue;

      const scored = partants.map(p => scoreParticipant(p, distance, partants.length, lk, true));
      scored.sort((a, b) => b.score - a.score);

      // Normalisation 10-90 (identique)
      const scores = scored.map(s => s.score);
      const minS = Math.min(...scores), maxS = Math.max(...scores), rng = maxS - minS || 1;
      scored.forEach(s => { s.scoreNorm = +((s.score - minS) / rng * 80 + 10).toFixed(1); });

      const distLabel = distance < 1400 ? 'Sprint' : distance < 1700 ? 'Mile' : distance < 2200 ? 'Middle' : 'Staying';
      console.log(`\n${'━'.repeat(60)}`);
      console.log(`🏟️  ${hippo} R${rNum}C${cNum} — ${course.libelle || ''}`);
      console.log(`📏 ${distance}m (${distLabel}) | ⏰ ${depart} | 🐴 ${partants.length} partants`);
      console.log('━'.repeat(60));
      console.log(`${'#'.padStart(3)} ${'Cheval'.padEnd(22)} ${'Cote'.padStart(5)} ${'Dérive'.padStart(7)} ${'Val'.padStart(4)} ${'Mus'.padStart(4)} ${'Score'.padStart(6)}`);
      console.log('─'.repeat(60));

      scored.forEach((s, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
        const coteStr = s.cote > 0 ? s.cote.toFixed(1) : '-';
        console.log(`${medal}${String(s.num).padStart(2)} ${s.nom.slice(0, 21).padEnd(22)} ${coteStr.padStart(5)} ${s.derive.padStart(7)} ${s.valeur.toFixed(0).padStart(4)} ${String(s.musScore).padStart(4)} ${s.scoreNorm.toFixed(1).padStart(6)}`);
      });

      const byCote = scored.filter(s => s.cote > 1).sort((a, b) => a.cote - b.cote);
      if (byCote.length && byCote[0].num !== scored[0].num) {
        console.log(`\n⭐ Favori: #${byCote[0].num} ${byCote[0].nom.slice(0, 20)} (cote ${byCote[0].cote})`);
        console.log(`🎯 Notre #1: #${scored[0].num} ${scored[0].nom.slice(0, 20)} (cote ${scored[0].cote})`);
        console.log(`   → DIVERGENCE = potentiel VALUE`);
      } else if (byCote.length) {
        console.log(`\n✅ Notre #1 = Favori: #${scored[0].num} ${scored[0].nom.slice(0, 20)}`);
      }
    }
  }
  console.log(`\n${'='.repeat(60)}\nTerminé.`);
}

main().catch(err => { console.error(err); process.exit(1); });
