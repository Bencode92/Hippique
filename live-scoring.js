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

  // Filtrer R/C
  let filterR = null, filterC = null;
  if (process.argv[2]) { const m = process.argv[2].match(/R(\d+)/i); if (m) filterR = parseInt(m[1]); }
  if (process.argv[3]) { const m = process.argv[3].match(/C(\d+)/i); if (m) filterC = parseInt(m[1]); }

  // Programme du jour
  const prog = await apiGet(`programme/${datePmu}?specialisation=INTERNET`);
  if (!prog) { console.log('❌ Pas de programme'); return; }

  for (const reunion of (prog.programme?.reunions || [])) {
    const rNum = reunion.numOfficiel || 0;
    if (filterR && rNum !== filterR) continue;
    const hippo = reunion.hippodrome?.libelleCourt || '?';

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
_log(`\n${'━'.repeat(60)}`);
_log(`🏟️  ${hippo} R${rNum}C${cNum} — ${course.libelle || ''}`);
_log(`📏 ${distance}m (${distLabel}) | ⏰ ${depart} | 🐴 ${partants.length} partants`);
_log('━'.repeat(60));
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

      } catch (err) {
        _log(`❌ Erreur scoring R${rNum}C${cNum}:`, err.message);
      }
    }
  }
_log(`\n${'='.repeat(60)}\nTerminé.`);
}

main().catch(err => { console.error(err); process.exit(1); });
