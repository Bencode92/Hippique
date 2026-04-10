// backtest-walkforward.js
// Walk-forward STRICT : pour prédire la course du jour J,
// on n'utilise QUE des données < J (pas de leakage temporel)
const fs = require('fs').promises;
const path = require('path');

const COURSES_DIR = './data/courses';
const OUTPUT_DIR = './data/backtest';

// Shrinkage bayésien (Laplace smoothing)
function bayesRate(wins, runs, popMean = 0.084, alpha = 10) {
  return (wins + alpha * popMean) / (runs + alpha);
}

async function main() {
  console.log('=== WALK-FORWARD BACKTEST (anti-leakage) ===\n');

  // 1. Charger TOUTES les courses, triées par date
  const files = (await fs.readdir(COURSES_DIR))
    .filter(f => f.endsWith('.json'))
    .sort();

  const allCourses = [];

  for (const file of files) {
    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const dateStr = dateMatch[1];

    try {
      const data = JSON.parse(await fs.readFile(path.join(COURSES_DIR, file), 'utf8'));

      for (const course of (data.courses || [])) {
        if (!['Plat', 'Obstacle'].includes(course.type)) continue;
        const participants = course.participants || [];
        if (!participants.length || !participants[0].jockey) continue;
        if (participants.length < 4) continue; // Minimum 4 partants

        allCourses.push({
          date: dateStr,
          hippodrome: data.hippodrome || '',
          nom: course.nom || '',
          distance: parseInt(String(course.distance || '').replace(/[^0-9]/g, '')) || 0,
          type: course.type,
          participants: participants.map((p, idx) => ({
            position: parseInt(p['n°'] || (idx + 1)),
            cheval: (p.cheval || '').replace(/\s+[MHFG]\.[A-Z]*\.?\s*\d*\s*a\.?.*/i, '').trim().toUpperCase(),
            jockey: (p.jockey || '').toUpperCase().trim(),
            entraineur: (p.entraineur || p['entraîneur'] || '').toUpperCase().trim(),
            poids: parseInt(String(p.poids || '').match(/(\d+)/)?.[1] || 0),
            nbCourses: parseInt(p.nb_courses) || 0,
            nbVictoires: parseInt(p.nb_victoires) || 0,
            nbPlaces: parseInt(p.nb_places) || 0,
            gains: parseInt(p.gains) || 0,
            corde: parseInt(String(p.corde || '').match(/(\d+)/)?.[1] || 0)
          }))
        });
      }
    } catch (e) {}
  }

  allCourses.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`${allCourses.length} courses chargées (${allCourses[0]?.date} → ${allCourses[allCourses.length-1]?.date})`);

  // 2. Walk-forward : pour chaque jour J, construire le modèle sur [0, J) puis prédire J
  const dates = [...new Set(allCourses.map(c => c.date))].sort();
  const MIN_TRAIN_COURSES = 100; // Minimum de courses pour commencer à prédire

  // Accumulateurs de stats temporels (construits incrementalement)
  const chevalStats = {};   // cheval → { courses, victoires, places, gains }
  const jockeyStats = {};
  const entraineurStats = {};
  const comboStats = {};    // jockey|||entraineur → { courses, victoires }

  let totalPredictions = 0;
  let top1Wins = 0;
  let top1InTop3 = 0;
  let top3InTop3 = 0;
  let totalLogLoss = 0;
  let totalCoursesPredites = 0;
  let coursesTrained = 0;
  let byDistance = {};
  let byFieldSize = {};

  for (const date of dates) {
    const todayCourses = allCourses.filter(c => c.date === date);
    const pastCourses = allCourses.filter(c => c.date < date);

    // Pas assez de données d'entraînement
    if (pastCourses.length < MIN_TRAIN_COURSES) {
      // Mais on accumule quand même les stats
      for (const course of todayCourses) {
        updateStats(course, chevalStats, jockeyStats, entraineurStats, comboStats);
        coursesTrained++;
      }
      continue;
    }

    // 3. Prédire chaque course du jour J avec les stats < J
    for (const course of todayCourses) {
      const nbPartants = course.participants.length;
      const distBucket = course.distance < 1400 ? 'sprint' : course.distance < 1900 ? 'mile' : course.distance < 2400 ? 'middle' : 'staying';
      const fieldBucket = nbPartants < 9 ? 'small' : nbPartants < 14 ? 'medium' : 'large';

      // Poids contextuels
      const W = {
        sprint: { c: 0.55, j: 0.15, e: 0.15 },
        mile: { c: 0.50, j: 0.20, e: 0.15 },
        middle: { c: 0.48, j: 0.22, e: 0.15 },
        staying: { c: 0.42, j: 0.28, e: 0.15 }
      };
      const w = W[distBucket];

      // Scorer chaque participant avec SEULEMENT les stats passées
      const scored = course.participants.map(p => {
        // Stats cheval (bayésien)
        const cs = chevalStats[p.cheval] || { courses: 0, victoires: 0, places: 0, gains: 0 };
        const tauxVCheval = bayesRate(cs.victoires, cs.courses);
        const tauxPCheval = bayesRate(cs.places, cs.courses, 0.3);

        // Stats jockey (bayésien)
        const js = jockeyStats[p.jockey] || { courses: 0, victoires: 0 };
        const tauxVJockey = bayesRate(js.victoires, js.courses);

        // Stats entraîneur (bayésien)
        const es = entraineurStats[p.entraineur] || { courses: 0, victoires: 0 };
        const tauxVEntraineur = bayesRate(es.victoires, es.courses);

        // Combo jockey × entraîneur (bayésien avec shrinkage fort)
        const comboKey = `${p.jockey}|||${p.entraineur}`;
        const co = comboStats[comboKey] || { courses: 0, victoires: 0 };
        const tauxVCombo = bayesRate(co.victoires, co.courses, tauxVJockey, 5);

        // Stats individuelles du participant (données PMU)
        let indivScore = 0;
        if (p.nbCourses >= 3) {
          const tauxVIndiv = bayesRate(p.nbVictoires, p.nbCourses);
          const gainParCourse = p.gains / p.nbCourses;
          indivScore = (tauxVIndiv - 0.084) * 30;
          if (gainParCourse > 5000000) indivScore += 4;
          else if (gainParCourse > 1000000) indivScore += 2;
          else if (gainParCourse < 100000) indivScore -= 2;
        }

        // Corde (impact par distance)
        const cordeImpact = { sprint: 1.0, mile: 0.6, middle: 0.3, staying: 0.1 };
        let cordeScore = 0;
        if (p.corde > 0) {
          const advantage = Math.max(-8, Math.min(8, 8 - (p.corde - 1) * 1.2));
          cordeScore = advantage * (cordeImpact[distBucket] || 0.5);
        }

        // Poids porté
        const avgPoids = course.participants.reduce((s, p) => s + (p.poids || 0), 0) / nbPartants;
        let poidsScore = 0;
        if (p.poids > 0 && avgPoids > 0) {
          const diff = p.poids - avgPoids;
          const poidsMultiplier = { sprint: 0.5, mile: 1.0, middle: 1.3, staying: 1.8 };
          poidsScore = -diff * 0.8 * (poidsMultiplier[distBucket] || 1.0);
        }

        // Score composite
        const score = (
          w.c * (tauxVCheval * 100 + tauxPCheval * 30 + indivScore) +
          w.j * (tauxVJockey * 100 + tauxVCombo * 20) +
          w.e * (tauxVEntraineur * 100) +
          cordeScore +
          poidsScore
        );

        return { ...p, score, tauxVCheval, tauxVJockey };
      });

      // Trier par score décroissant
      scored.sort((a, b) => b.score - a.score);
      scored.forEach((s, i) => s.rangPredit = i + 1);

      // Convertir en probabilités (softmax)
      const maxScore = Math.max(...scored.map(s => s.score));
      const expScores = scored.map(s => Math.exp((s.score - maxScore) / 5)); // température = 5
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      scored.forEach((s, i) => s.proba = expScores[i] / sumExp);

      // Évaluer
      totalCoursesPredites++;
      const predicted1 = scored[0];
      const actualWinner = scored.find(s => s.position === 1);

      if (predicted1.position === 1) top1Wins++;
      if (predicted1.position <= 3) top1InTop3++;

      const ourTop3 = scored.filter(s => s.rangPredit <= 3);
      if (ourTop3.some(s => s.position <= 3)) top3InTop3++;

      // Log-loss (sur le vrai gagnant)
      if (actualWinner) {
        totalLogLoss += -Math.log(Math.max(actualWinner.proba, 1e-6));
      }

      // Par distance
      if (!byDistance[distBucket]) byDistance[distBucket] = { courses: 0, top1: 0, top3in3: 0 };
      byDistance[distBucket].courses++;
      if (predicted1.position === 1) byDistance[distBucket].top1++;
      if (ourTop3.some(s => s.position <= 3)) byDistance[distBucket].top3in3++;

      // Par taille de peloton
      if (!byFieldSize[fieldBucket]) byFieldSize[fieldBucket] = { courses: 0, top1: 0, avgPartants: 0 };
      byFieldSize[fieldBucket].courses++;
      byFieldSize[fieldBucket].avgPartants += nbPartants;
      if (predicted1.position === 1) byFieldSize[fieldBucket].top1++;
    }

    // APRÈS avoir prédit, on ajoute les résultats du jour aux stats (walk-forward)
    for (const course of todayCourses) {
      updateStats(course, chevalStats, jockeyStats, entraineurStats, comboStats);
      coursesTrained++;
    }
  }

  // Résultats
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RÉSULTATS WALK-FORWARD STRICT (anti-leakage)`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Courses prédites : ${totalCoursesPredites}`);
  console.log(`Courses d'entraînement : ${coursesTrained}`);
  console.log(``);
  console.log(`📊 ACCURACY :`);
  console.log(`  Notre #1 gagne :             ${(top1Wins / totalCoursesPredites * 100).toFixed(1)}%`);
  console.log(`  Notre #1 dans le top 3 :     ${(top1InTop3 / totalCoursesPredites * 100).toFixed(1)}%`);
  console.log(`  Un de nos top 3 dans top 3 : ${(top3InTop3 / totalCoursesPredites * 100).toFixed(1)}%`);
  console.log(``);
  console.log(`📉 MÉTRIQUES CALIBRATION :`);
  console.log(`  Log-loss moyen :             ${(totalLogLoss / totalCoursesPredites).toFixed(3)}`);
  console.log(`  Baseline random :            ${(Math.log(10)).toFixed(3)} (10 partants moyen)`);
  console.log(``);

  console.log(`📏 PAR DISTANCE :`);
  for (const [bucket, stats] of Object.entries(byDistance)) {
    console.log(`  ${bucket.padEnd(15)} ${stats.courses}c | #1 gagne: ${(stats.top1 / stats.courses * 100).toFixed(1)}% | top3in3: ${(stats.top3in3 / stats.courses * 100).toFixed(1)}%`);
  }

  console.log(`\n📐 PAR TAILLE PELOTON :`);
  for (const [bucket, stats] of Object.entries(byFieldSize)) {
    const avgN = (stats.avgPartants / stats.courses).toFixed(1);
    console.log(`  ${bucket.padEnd(10)} ${stats.courses}c (moy ${avgN} partants) | #1 gagne: ${(stats.top1 / stats.courses * 100).toFixed(1)}% | baseline: ${(1 / avgN * 100).toFixed(1)}%`);
  }

  // Sauvegarder
  const report = {
    method: 'walk_forward_strict',
    date: new Date().toISOString(),
    coursesPredites: totalCoursesPredites,
    coursesEntrainement: coursesTrained,
    accuracy: {
      top1WinRate: +(top1Wins / totalCoursesPredites * 100).toFixed(1),
      top1InTop3: +(top1InTop3 / totalCoursesPredites * 100).toFixed(1),
      top3InTop3: +(top3InTop3 / totalCoursesPredites * 100).toFixed(1),
      logLoss: +(totalLogLoss / totalCoursesPredites).toFixed(3),
    },
    byDistance,
    byFieldSize
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, 'walkforward_report.json'), JSON.stringify(report, null, 2));
  console.log(`\n✅ Rapport sauvegardé → data/backtest/walkforward_report.json`);
}

// Mettre à jour les stats accumulées (appelé APRÈS la prédiction)
function updateStats(course, chevalStats, jockeyStats, entraineurStats, comboStats) {
  for (const p of course.participants) {
    const pos = p.position;
    if (!pos || pos < 1) continue;

    // Cheval
    if (p.cheval) {
      if (!chevalStats[p.cheval]) chevalStats[p.cheval] = { courses: 0, victoires: 0, places: 0, gains: 0 };
      chevalStats[p.cheval].courses++;
      if (pos === 1) chevalStats[p.cheval].victoires++;
      if (pos <= 3) chevalStats[p.cheval].places++;
      chevalStats[p.cheval].gains += p.gains || 0;
    }

    // Jockey
    if (p.jockey) {
      if (!jockeyStats[p.jockey]) jockeyStats[p.jockey] = { courses: 0, victoires: 0 };
      jockeyStats[p.jockey].courses++;
      if (pos === 1) jockeyStats[p.jockey].victoires++;
    }

    // Entraîneur
    if (p.entraineur) {
      if (!entraineurStats[p.entraineur]) entraineurStats[p.entraineur] = { courses: 0, victoires: 0 };
      entraineurStats[p.entraineur].courses++;
      if (pos === 1) entraineurStats[p.entraineur].victoires++;
    }

    // Combo
    if (p.jockey && p.entraineur) {
      const key = `${p.jockey}|||${p.entraineur}`;
      if (!comboStats[key]) comboStats[key] = { courses: 0, victoires: 0 };
      comboStats[key].courses++;
      if (pos === 1) comboStats[key].victoires++;
    }
  }
}

main().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
