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
  levierData = { jk25, jk26, chx25, chx26 };
  return levierData;
}

// Fuzzy match : "C. DEMURO" ou "DEMURO C." → "CRISTIAN DEMURO"
function fuzzyMatch(map, shortName) {
  if (!shortName || shortName.length < 3) return null;
  const key = shortName.toUpperCase().trim();
  if (map[key]) return map[key];

  let init = '', fam = '';
  // Format "C. DEMURO" ou "C DEMURO" ou "C.DEMURO" (sans espace)
  let m = key.match(/^([A-Z])\.?\s*(.{3,})$/);
  if (m) { init = m[1]; fam = m[2].trim(); }
  // Format "DEMURO C." ou "DEMURO C"
  if (!m) { m = key.match(/^(.{3,?})\s+([A-Z])\.?$/); if (m) { fam = m[1].trim(); init = m[2]; } }
  // Format complet "CRISTIAN DEMURO" — chercher direct
  if (!m) {
    for (const [k, v] of Object.entries(map)) {
      if (k === key) return v;
      // Chercher si le nom contient le key ou vice versa
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

// Meilleur levier par distance (basé sur l'analyse stats)
function getLevierScore(participant, distBucket, ld) {
  const jk = (participant.jockey || '').toUpperCase().trim();
  const nom = extractNomCheval(participant.cheval);
  const j25 = fuzzyMatch(ld.jk25, jk) || ld.jk25[jk];
  const j26 = fuzzyMatch(ld.jk26, jk) || ld.jk26[jk];
  const ch25 = ld.chx25[nom], ch26 = ld.chx26[nom];

  const jkTauxP = Math.max(j25 ? parseFloat(j25.TauxPlace || 0) : 0, j26 ? parseFloat(j26.TauxPlace || 0) : 0) || 30;
  const jkTauxV = Math.max(j25 ? parseFloat(j25.TauxVictoire || 0) : 0, j26 ? parseFloat(j26.TauxVictoire || 0) : 0) || 8;
  const chTauxV = Math.max(ch25 ? parseFloat(ch25.TauxVictoire || 0) : 0, ch26 ? parseFloat(ch26.TauxVictoire || 0) : 0) || 8;

  // Formule optimale par distance (d'après l'analyse leviers)
  if (distBucket === 'sprint')  return { score: jkTauxP * 0.6 + chTauxV * 0.4, label: 'JkTauxP×60% + ChTauxV×40%' };
  if (distBucket === 'mile')    return { score: jkTauxP * 0.5 + jkTauxV * 0.3 + chTauxV * 0.2, label: 'JkTauxP×50% + JkTauxV×30% + ChTauxV×20%' };
  if (distBucket === 'middle')  return { score: jkTauxP * 0.5 + chTauxV * 0.3 + jkTauxV * 0.2, label: 'JkTauxP×50% + ChTauxV×30% + JkTauxV×20%' };
  if (distBucket === 'staying') return { score: jkTauxP * 0.6 + jkTauxV * 0.2 + chTauxV * 0.2, label: 'JkTauxP×60% + JkTauxV×20% + ChTauxV×20%' };
  return { score: jkTauxP, label: 'JkTauxP' };
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

        // Trier par score
        const sorted = [...scoresPredictifs].sort((a, b) =>
          parseFloat(b.scorePredictif.score) - parseFloat(a.scorePredictif.score)
        );

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
          const lr = getLevierScore(p, distBucket, ld);
          return { ...p, _levScore: lr.score, _levLabel: lr.label };
        });
        levierResults.sort((a, b) => b._levScore - a._levScore);
        // Normaliser 10-90
        const scores = levierResults.map(r => r._levScore);
        const minS = Math.min(...scores), maxS = Math.max(...scores);
        const rng = maxS - minS || 1;
        levierResults.forEach(r => { r._levNorm = ((r._levScore - minS) / rng * 80 + 10).toFixed(1); });

_log(`\n🔬 CLASSEMENT LEVIERS (${levierResults[0]._levLabel})`);
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
_log(`\n⚡ Top1 différent : Modèle=#${top1Modele} vs Leviers=#${top1Levier}`);
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
