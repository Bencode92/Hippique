// backtesting.js
// Système d'auto-amélioration : compare les prédictions aux résultats réels
// et optimise les poids du modèle par gradient descent
const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = './data';
const PREDICTIONS_DIR = './data/predictions';
const RESULTS_DIR = './data/courses';
const BACKTEST_DIR = './data/backtest';

// ============================================================
// 1. SAUVEGARDER LES PRÉDICTIONS DU JOUR
// ============================================================
// Appelé AVANT les courses : sauve les scores prédictifs pour chaque participant
async function savePredictions(date) {
  const dateStr = date || new Date().toISOString().split('T')[0];
  console.log(`\n=== SAUVEGARDE DES PRÉDICTIONS POUR ${dateStr} ===`);

  // Charger les fichiers de courses du jour
  const allFiles = await fs.readdir(RESULTS_DIR);
  const todayFiles = allFiles.filter(f => f.startsWith(dateStr) && f.endsWith('.json'));

  if (!todayFiles.length) {
    console.log(`Aucune course trouvée pour ${dateStr}`);
    return;
  }

  // Charger les données de ranking (simplifié — en prod, utiliser ranking-loader)
  const rankings = {};
  for (const cat of ['chevaux', 'jockeys', 'entraineurs', 'eleveurs', 'proprietaires']) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(DATA_DIR, `${cat}_ponderated_latest.json`), 'utf8'));
      rankings[cat] = {};
      (data.resultats || []).forEach(item => {
        const key = (item.Nom || item.NomPostal || '').toUpperCase();
        if (key) rankings[cat][key] = parseInt(item.Rang) || 999;
      });
    } catch (e) { rankings[cat] = {}; }
  }

  // Charger la config des poids actuels
  let weights;
  try {
    weights = JSON.parse(await fs.readFile(path.join(BACKTEST_DIR, 'current_weights.json'), 'utf8'));
  } catch (e) {
    // Poids par défaut
    weights = {
      DIST_WEIGHTS: {
        sprint:  { cheval: 0.55, jockey: 0.15, entraineur: 0.15, eleveur: 0.08, proprietaire: 0.07 },
        mile:    { cheval: 0.50, jockey: 0.20, entraineur: 0.15, eleveur: 0.08, proprietaire: 0.07 },
        middle:  { cheval: 0.48, jockey: 0.22, entraineur: 0.15, eleveur: 0.08, proprietaire: 0.07 },
        staying: { cheval: 0.42, jockey: 0.28, entraineur: 0.15, eleveur: 0.08, proprietaire: 0.07 }
      }
    };
  }

  const predictions = [];

  for (const file of todayFiles) {
    try {
      const courseData = JSON.parse(await fs.readFile(path.join(RESULTS_DIR, file), 'utf8'));
      const hippodrome = courseData.hippodrome || file.replace('.json', '');

      for (const course of (courseData.courses || [])) {
        const distance = parseInt(String(course.distance || '').replace(/[^0-9]/g, '')) || 0;
        const distBucket = distance < 1400 ? 'sprint' : distance < 1900 ? 'mile' : distance < 2400 ? 'middle' : 'staying';
        const type = (course.type || 'Plat').toLowerCase();
        const w = weights.DIST_WEIGHTS[distBucket] || weights.DIST_WEIGHTS.mile;

        const participants = course.participants || [];
        if (!participants.length || !participants[0].jockey) continue;

        const scored = participants.map((p, idx) => {
          const position = parseInt(p['n°'] || (idx + 1));
          const chevalName = (p.cheval || '').replace(/\s+[MHFG]\.\w+\.\s*\d+\s*a\..*$/, '').trim().toUpperCase();
          const jockeyName = (p.jockey || '').toUpperCase();
          const entraineurName = (p.entraineur || p['entraîneur'] || '').toUpperCase();

          const maxRang = 100;
          const rangCheval = rankings.chevaux[chevalName] || null;
          const rangJockey = rankings.jockeys[jockeyName] || null;
          const rangEntraineur = rankings.entraineurs[entraineurName] || null;

          const scoreCheval = rangCheval ? Math.max(0, maxRang - rangCheval) : 30;
          const scoreJockey = rangJockey ? Math.max(0, maxRang - rangJockey) : 30;
          const scoreEntraineur = rangEntraineur ? Math.max(0, maxRang - rangEntraineur) : 30;

          const scorePredictif = (
            w.cheval * scoreCheval +
            w.jockey * scoreJockey +
            w.entraineur * scoreEntraineur
          );

          return {
            position,
            cheval: chevalName,
            jockey: jockeyName,
            entraineur: entraineurName,
            scorePredictif: +scorePredictif.toFixed(2),
            rangs: { cheval: rangCheval, jockey: rangJockey, entraineur: rangEntraineur }
          };
        });

        // Trier par score prédictif décroissant et assigner un rang prédit
        scored.sort((a, b) => b.scorePredictif - a.scorePredictif);
        scored.forEach((s, i) => { s.rangPredit = i + 1; });

        predictions.push({
          hippodrome,
          course: course.nom,
          distance,
          distBucket,
          type,
          nbPartants: participants.length,
          weightsUsed: w,
          participants: scored
        });
      }
    } catch (e) {
      // Fichier invalide
    }
  }

  // Sauvegarder
  await fs.mkdir(PREDICTIONS_DIR, { recursive: true });
  const outFile = path.join(PREDICTIONS_DIR, `predictions_${dateStr}.json`);
  await fs.writeFile(outFile, JSON.stringify({
    date: dateStr,
    timestamp: new Date().toISOString(),
    nbCourses: predictions.length,
    predictions
  }, null, 2));

  console.log(`✅ ${predictions.length} courses sauvegardées → ${outFile}`);
  return predictions;
}


// ============================================================
// 2. COMPARER PRÉDICTIONS vs RÉSULTATS RÉELS
// ============================================================
async function compareResults(date) {
  const dateStr = date || new Date().toISOString().split('T')[0];
  console.log(`\n=== COMPARAISON PRÉDICTIONS vs RÉSULTATS (${dateStr}) ===`);

  // Charger les prédictions du jour
  let predictions;
  try {
    predictions = JSON.parse(await fs.readFile(
      path.join(PREDICTIONS_DIR, `predictions_${dateStr}.json`), 'utf8'
    ));
  } catch (e) {
    console.log(`❌ Pas de prédictions pour ${dateStr}. Lancez d'abord savePredictions.`);
    return null;
  }

  let totalCourses = 0;
  let topPredictedWins = 0;       // Notre #1 a gagné
  let topPredictedTop3 = 0;       // Notre #1 est dans le top 3
  let top3PredictedInTop3 = 0;    // Au moins 1 de nos top 3 dans le vrai top 3
  let totalMeanError = 0;         // Erreur moyenne de position
  let resultsByDistance = {};

  for (const course of predictions.predictions) {
    const participants = course.participants;
    if (!participants.length) continue;

    totalCourses++;
    const bucket = course.distBucket;
    if (!resultsByDistance[bucket]) {
      resultsByDistance[bucket] = { courses: 0, top1wins: 0, top3in3: 0, meanError: 0 };
    }
    resultsByDistance[bucket].courses++;

    // Notre prédiction #1
    const predicted1 = participants[0]; // rangPredit = 1
    if (predicted1.position === 1) {
      topPredictedWins++;
      resultsByDistance[bucket].top1wins++;
    }
    if (predicted1.position <= 3) {
      topPredictedTop3++;
    }

    // Au moins 1 de nos top 3 dans le vrai top 3
    const ourTop3 = participants.filter(p => p.rangPredit <= 3);
    const hasTop3InTop3 = ourTop3.some(p => p.position <= 3);
    if (hasTop3InTop3) {
      top3PredictedInTop3++;
      resultsByDistance[bucket].top3in3++;
    }

    // Erreur moyenne : |position réelle - rang prédit|
    const errors = participants.map(p => Math.abs(p.position - p.rangPredit));
    const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
    totalMeanError += meanError;
    resultsByDistance[bucket].meanError += meanError;
  }

  const results = {
    date: dateStr,
    totalCourses,
    accuracy: {
      top1WinRate: totalCourses > 0 ? +(topPredictedWins / totalCourses * 100).toFixed(1) : 0,
      top1InTop3Rate: totalCourses > 0 ? +(topPredictedTop3 / totalCourses * 100).toFixed(1) : 0,
      top3InTop3Rate: totalCourses > 0 ? +(top3PredictedInTop3 / totalCourses * 100).toFixed(1) : 0,
      meanPositionError: totalCourses > 0 ? +(totalMeanError / totalCourses).toFixed(2) : 0
    },
    byDistance: {}
  };

  for (const [bucket, stats] of Object.entries(resultsByDistance)) {
    results.byDistance[bucket] = {
      courses: stats.courses,
      top1WinRate: stats.courses > 0 ? +(stats.top1wins / stats.courses * 100).toFixed(1) : 0,
      top3InTop3Rate: stats.courses > 0 ? +(stats.top3in3 / stats.courses * 100).toFixed(1) : 0,
      meanError: stats.courses > 0 ? +(stats.meanError / stats.courses).toFixed(2) : 0
    };
  }

  // Sauvegarder le rapport
  await fs.mkdir(BACKTEST_DIR, { recursive: true });
  const reportFile = path.join(BACKTEST_DIR, `report_${dateStr}.json`);
  await fs.writeFile(reportFile, JSON.stringify(results, null, 2));

  // Affichage
  console.log(`\n📊 RÉSULTATS SUR ${totalCourses} COURSES :`);
  console.log(`  Notre #1 gagne :           ${results.accuracy.top1WinRate}%`);
  console.log(`  Notre #1 dans le top 3 :   ${results.accuracy.top1InTop3Rate}%`);
  console.log(`  Un de nos top 3 dans le top 3 : ${results.accuracy.top3InTop3Rate}%`);
  console.log(`  Erreur moyenne de position : ${results.accuracy.meanPositionError}`);

  console.log(`\n📏 PAR DISTANCE :`);
  for (const [bucket, stats] of Object.entries(results.byDistance)) {
    console.log(`  ${bucket}: ${stats.courses} courses, top1=${stats.top1WinRate}%, top3in3=${stats.top3InTop3Rate}%, erreur=${stats.meanError}`);
  }

  return results;
}


// ============================================================
// 3. OPTIMISER LES POIDS (gradient descent simplifié)
// ============================================================
async function optimizeWeights() {
  console.log('\n=== OPTIMISATION DES POIDS (GRADIENT DESCENT) ===');

  await fs.mkdir(BACKTEST_DIR, { recursive: true });

  // Charger tous les rapports de backtest disponibles
  const files = (await fs.readdir(BACKTEST_DIR)).filter(f => f.startsWith('report_') && f.endsWith('.json'));
  if (files.length < 3) {
    console.log(`⚠️ Seulement ${files.length} rapport(s) disponible(s). Minimum 3 pour optimiser.`);
    console.log('Continuez à utiliser le système et relancez après quelques jours de courses.');
    return null;
  }

  const reports = [];
  for (const f of files) {
    try {
      reports.push(JSON.parse(await fs.readFile(path.join(BACKTEST_DIR, f), 'utf8')));
    } catch (e) {}
  }

  console.log(`📈 ${reports.length} rapports chargés`);

  // Calculer la performance globale actuelle
  let totalCourses = 0;
  let totalTop1Wins = 0;
  let totalTop3In3 = 0;
  const distPerf = {};

  for (const r of reports) {
    totalCourses += r.totalCourses;
    totalTop1Wins += Math.round(r.accuracy.top1WinRate * r.totalCourses / 100);
    totalTop3In3 += Math.round(r.accuracy.top3InTop3Rate * r.totalCourses / 100);

    for (const [bucket, stats] of Object.entries(r.byDistance || {})) {
      if (!distPerf[bucket]) distPerf[bucket] = { courses: 0, top1wins: 0, top3in3: 0, totalError: 0 };
      distPerf[bucket].courses += stats.courses;
      distPerf[bucket].top1wins += Math.round(stats.top1WinRate * stats.courses / 100);
      distPerf[bucket].top3in3 += Math.round(stats.top3InTop3Rate * stats.courses / 100);
      distPerf[bucket].totalError += stats.meanError * stats.courses;
    }
  }

  console.log(`\n📊 PERFORMANCE GLOBALE (${totalCourses} courses) :`);
  console.log(`  Top 1 win rate: ${(totalTop1Wins / totalCourses * 100).toFixed(1)}%`);
  console.log(`  Top 3 in top 3: ${(totalTop3In3 / totalCourses * 100).toFixed(1)}%`);

  // Charger les poids actuels
  let currentWeights;
  try {
    currentWeights = JSON.parse(await fs.readFile(path.join(BACKTEST_DIR, 'current_weights.json'), 'utf8'));
  } catch (e) {
    currentWeights = {
      DIST_WEIGHTS: {
        sprint:  { cheval: 0.55, jockey: 0.15, entraineur: 0.15, eleveur: 0.08, proprietaire: 0.07 },
        mile:    { cheval: 0.50, jockey: 0.20, entraineur: 0.15, eleveur: 0.08, proprietaire: 0.07 },
        middle:  { cheval: 0.48, jockey: 0.22, entraineur: 0.15, eleveur: 0.08, proprietaire: 0.07 },
        staying: { cheval: 0.42, jockey: 0.28, entraineur: 0.15, eleveur: 0.08, proprietaire: 0.07 }
      }
    };
  }

  // Gradient descent par distance
  // Pour chaque bucket, si le modèle se trompe plus qu'attendu,
  // ajuster les poids vers la source d'erreur
  const LEARNING_RATE = 0.02;
  const newWeights = JSON.parse(JSON.stringify(currentWeights));
  let adjustments = [];

  for (const [bucket, perf] of Object.entries(distPerf)) {
    if (perf.courses < 5) continue;

    const winRate = perf.top1wins / perf.courses;
    const avgError = perf.totalError / perf.courses;
    const w = newWeights.DIST_WEIGHTS[bucket];
    if (!w) continue;

    // Si l'erreur est élevée (>4), augmenter le poids du cheval (facteur le plus prédictif)
    // Si l'erreur est faible (<2), on est bien calibré
    if (avgError > 4) {
      // Le modèle se trompe beaucoup → augmenter cheval, réduire les autres
      const shift = LEARNING_RATE;
      w.cheval = Math.min(0.65, w.cheval + shift);
      w.jockey = Math.max(0.08, w.jockey - shift * 0.5);
      w.entraineur = Math.max(0.08, w.entraineur - shift * 0.5);
      adjustments.push(`${bucket}: cheval +${(shift*100).toFixed(0)}%, erreur élevée (${avgError.toFixed(1)})`);
    } else if (avgError < 2 && winRate < 0.15) {
      // Erreur faible mais peu de victoires prédites → augmenter jockey (plus discriminant)
      const shift = LEARNING_RATE * 0.5;
      w.jockey = Math.min(0.35, w.jockey + shift);
      w.cheval = Math.max(0.35, w.cheval - shift);
      adjustments.push(`${bucket}: jockey +${(shift*100).toFixed(0)}%, win rate bas (${(winRate*100).toFixed(0)}%)`);
    }

    // Normaliser pour que la somme = 1
    const total = w.cheval + w.jockey + w.entraineur + w.eleveur + w.proprietaire;
    for (const k of Object.keys(w)) {
      w[k] = +(w[k] / total).toFixed(3);
    }
  }

  // Sauvegarder les nouveaux poids
  await fs.writeFile(
    path.join(BACKTEST_DIR, 'current_weights.json'),
    JSON.stringify(newWeights, null, 2)
  );

  // Sauvegarder l'historique des ajustements
  let history;
  try {
    history = JSON.parse(await fs.readFile(path.join(BACKTEST_DIR, 'optimization_history.json'), 'utf8'));
  } catch (e) {
    history = [];
  }

  history.push({
    date: new Date().toISOString(),
    reportsUsed: reports.length,
    totalCourses,
    globalWinRate: +(totalTop1Wins / totalCourses * 100).toFixed(1),
    globalTop3Rate: +(totalTop3In3 / totalCourses * 100).toFixed(1),
    adjustments,
    newWeights: newWeights.DIST_WEIGHTS
  });

  await fs.writeFile(
    path.join(BACKTEST_DIR, 'optimization_history.json'),
    JSON.stringify(history, null, 2)
  );

  if (adjustments.length) {
    console.log('\n🔧 AJUSTEMENTS APPLIQUÉS :');
    adjustments.forEach(a => console.log(`  → ${a}`));
  } else {
    console.log('\n✅ Poids actuels optimaux, aucun ajustement nécessaire');
  }

  console.log('\n✅ Nouveaux poids sauvegardés dans data/backtest/current_weights.json');
  return newWeights;
}


// ============================================================
// 4. BACKTEST HISTORIQUE (sur les courses passées)
// ============================================================
async function backtestHistorique() {
  console.log('\n=== BACKTEST SUR DONNÉES HISTORIQUES ===');

  // Utiliser les fichiers de courses existants comme source de vérité
  const allFiles = (await fs.readdir(RESULTS_DIR)).filter(f => f.endsWith('.json'));
  console.log(`${allFiles.length} fichiers de courses disponibles`);

  // Grouper par date
  const dates = [...new Set(allFiles.map(f => f.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]).filter(Boolean))];
  dates.sort();

  // Pour chaque date, sauvegarder les prédictions puis comparer
  let processedDates = 0;
  for (const date of dates.slice(-30)) { // 30 derniers jours
    await savePredictions(date);
    const result = await compareResults(date);
    if (result && result.totalCourses > 0) processedDates++;
  }

  console.log(`\n📊 ${processedDates} jours de courses backtestés`);

  // Lancer l'optimisation
  if (processedDates >= 3) {
    await optimizeWeights();
  }
}


// ============================================================
// MAIN
// ============================================================
async function main() {
  const command = process.argv[2] || 'backtest';
  const date = process.argv[3];

  switch (command) {
    case 'save':
      await savePredictions(date);
      break;
    case 'compare':
      await compareResults(date);
      break;
    case 'optimize':
      await optimizeWeights();
      break;
    case 'backtest':
      await backtestHistorique();
      break;
    default:
      console.log('Usage: node backtesting.js [save|compare|optimize|backtest] [date]');
  }
}

main().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
