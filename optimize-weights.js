// optimize-weights.js
// Grid search sur les poids avec walk-forward STRICT
// Train (60%) → Validation (20%) → Test (20%)
// Optimise sur train+val, rapporte sur test = chiffre honnête
const fs = require('fs').promises;
const path = require('path');

const COURSES_DIR = './data/courses';

function bayesRate(wins, runs, popMean = 0.084, alpha = 10) {
  return (wins + alpha * popMean) / (runs + alpha);
}

async function loadAllCourses() {
  const files = (await fs.readdir(COURSES_DIR)).filter(f => f.endsWith('.json')).sort();
  const courses = [];

  for (const file of files) {
    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;

    try {
      const data = JSON.parse(await fs.readFile(path.join(COURSES_DIR, file), 'utf8'));
      for (const course of (data.courses || [])) {
        if (!['Plat', 'Obstacle'].includes(course.type)) continue;
        const participants = course.participants || [];
        if (!participants.length || !participants[0].jockey || participants.length < 4) continue;

        courses.push({
          date: dateMatch[1],
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

  return courses.sort((a, b) => a.date.localeCompare(b.date));
}

// Scorer une course avec des paramètres donnés
function scoreCourse(course, stats, params) {
  const distBucket = course.distance < 1400 ? 'sprint' : course.distance < 1900 ? 'mile' : course.distance < 2400 ? 'middle' : 'staying';

  // Poids par distance (paramétrisés)
  const wCheval = params.wCheval[distBucket];
  const wJockey = params.wJockey[distBucket];
  const wEntraineur = params.wEntraineur[distBucket];
  const wIndiv = params.wIndiv;
  const wCorde = params.wCorde[distBucket];
  const wPoids = params.wPoids[distBucket];
  const alpha = params.alpha;

  const avgPoids = course.participants.reduce((s, p) => s + (p.poids || 0), 0) / course.participants.length;

  return course.participants.map(p => {
    const cs = stats.cheval[p.cheval] || { c: 0, v: 0, p: 0 };
    const js = stats.jockey[p.jockey] || { c: 0, v: 0 };
    const es = stats.entraineur[p.entraineur] || { c: 0, v: 0 };
    const comboKey = `${p.jockey}|||${p.entraineur}`;
    const co = stats.combo[comboKey] || { c: 0, v: 0 };

    // Features bayésiennes
    const fCheval = bayesRate(cs.v, cs.c, 0.084, alpha) * 100;
    const fChevalPlace = bayesRate(cs.p, cs.c, 0.3, alpha) * 30;
    const fJockey = bayesRate(js.v, js.c, 0.084, alpha) * 100;
    const fEntraineur = bayesRate(es.v, es.c, 0.084, alpha) * 100;
    const fCombo = bayesRate(co.v, co.c, bayesRate(js.v, js.c, 0.084, alpha), 5) * 50;

    // Stats individuelles PMU
    let fIndiv = 0;
    if (p.nbCourses >= 3) {
      fIndiv += (bayesRate(p.nbVictoires, p.nbCourses) - 0.084) * 40;
      const gpc = p.gains / p.nbCourses;
      if (gpc > 5000000) fIndiv += 5;
      else if (gpc > 1000000) fIndiv += 2;
      else if (gpc < 100000) fIndiv -= 2;
    }

    // Corde
    let fCorde = 0;
    if (p.corde > 0) {
      fCorde = Math.max(-8, Math.min(8, 8 - (p.corde - 1) * 1.2));
    }

    // Poids porté
    let fPoids = 0;
    if (p.poids > 0 && avgPoids > 0) {
      fPoids = -(p.poids - avgPoids) * 0.8;
    }

    const score = wCheval * (fCheval + fChevalPlace) +
                  wJockey * (fJockey + fCombo * 0.3) +
                  wEntraineur * fEntraineur +
                  wIndiv * fIndiv +
                  wCorde * fCorde +
                  wPoids * fPoids;

    return { ...p, score };
  });
}

// Évaluer un ensemble de paramètres sur une période
function evaluate(courses, stats, params, startIdx) {
  let top1Wins = 0;
  let top3In3 = 0;
  let total = 0;
  let logLoss = 0;

  const localStats = JSON.parse(JSON.stringify(stats));

  for (let i = startIdx; i < courses.length; i++) {
    const course = courses[i];
    const scored = scoreCourse(course, localStats, params);

    scored.sort((a, b) => b.score - a.score);
    scored.forEach((s, idx) => s.rangPredit = idx + 1);

    // Softmax probas
    const maxS = Math.max(...scored.map(s => s.score));
    const exps = scored.map(s => Math.exp((s.score - maxS) / params.temperature));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    scored.forEach((s, idx) => s.proba = exps[idx] / sumExp);

    total++;
    if (scored[0].position === 1) top1Wins++;
    const ourTop3 = scored.filter(s => s.rangPredit <= 3);
    if (ourTop3.some(s => s.position <= 3)) top3In3++;

    const winner = scored.find(s => s.position === 1);
    if (winner) logLoss += -Math.log(Math.max(winner.proba, 1e-6));

    // Update stats après prédiction
    updateStats(course, localStats);
  }

  return {
    total,
    top1Rate: total > 0 ? +(top1Wins / total * 100).toFixed(1) : 0,
    top3In3Rate: total > 0 ? +(top3In3 / total * 100).toFixed(1) : 0,
    logLoss: total > 0 ? +(logLoss / total).toFixed(3) : 99
  };
}

function updateStats(course, stats) {
  for (const p of course.participants) {
    if (!p.position || p.position < 1) continue;
    if (p.cheval) {
      if (!stats.cheval[p.cheval]) stats.cheval[p.cheval] = { c: 0, v: 0, p: 0 };
      stats.cheval[p.cheval].c++;
      if (p.position === 1) stats.cheval[p.cheval].v++;
      if (p.position <= 3) stats.cheval[p.cheval].p++;
    }
    if (p.jockey) {
      if (!stats.jockey[p.jockey]) stats.jockey[p.jockey] = { c: 0, v: 0 };
      stats.jockey[p.jockey].c++;
      if (p.position === 1) stats.jockey[p.jockey].v++;
    }
    if (p.entraineur) {
      if (!stats.entraineur[p.entraineur]) stats.entraineur[p.entraineur] = { c: 0, v: 0 };
      stats.entraineur[p.entraineur].c++;
      if (p.position === 1) stats.entraineur[p.entraineur].v++;
    }
    if (p.jockey && p.entraineur) {
      const k = `${p.jockey}|||${p.entraineur}`;
      if (!stats.combo[k]) stats.combo[k] = { c: 0, v: 0 };
      stats.combo[k].c++;
      if (p.position === 1) stats.combo[k].v++;
    }
  }
}

async function main() {
  console.log('=== OPTIMISATION DES POIDS (Grid Search + Walk-Forward) ===\n');

  const courses = await loadAllCourses();
  console.log(`${courses.length} courses chargées`);

  // Split : 60% train, 20% validation, 20% test
  const trainEnd = Math.floor(courses.length * 0.6);
  const valEnd = Math.floor(courses.length * 0.8);

  const trainDate = courses[trainEnd - 1].date;
  const valDate = courses[valEnd - 1].date;
  const testDate = courses[courses.length - 1].date;

  console.log(`Train : 0-${trainEnd} (→ ${trainDate})`);
  console.log(`Val   : ${trainEnd}-${valEnd} (→ ${valDate})`);
  console.log(`Test  : ${valEnd}-${courses.length} (→ ${testDate})\n`);

  // Construire les stats initiales sur la période train
  const baseStats = { cheval: {}, jockey: {}, entraineur: {}, combo: {} };
  for (let i = 0; i < trainEnd; i++) {
    updateStats(courses[i], baseStats);
  }

  // Grid search sur la période validation
  const configs = [];

  // Paramètres à tester
  const chevalWeights = [0.35, 0.45, 0.55, 0.65];
  const jockeyWeights = [0.10, 0.20, 0.30];
  const indivWeights = [0, 0.5, 1.0, 1.5];
  const cordeMultipliers = [0, 0.5, 1.0];
  const poidsMultipliers = [0, 0.5, 1.0];
  const alphas = [5, 10, 20];
  const temperatures = [3, 5, 8];

  console.log('Grid search en cours...');
  let tested = 0;
  let bestConfig = null;
  let bestScore = -Infinity;

  for (const wc of chevalWeights) {
    for (const wj of jockeyWeights) {
      const we = Math.max(0.05, 1 - wc - wj); // Reste pour entraîneur
      if (we > 0.3 || we < 0.05) continue;

      for (const wi of indivWeights) {
        for (const wcorde of cordeMultipliers) {
          for (const wpoids of poidsMultipliers) {
            for (const alpha of alphas) {
              for (const temp of temperatures) {
                const params = {
                  wCheval: { sprint: wc + 0.05, mile: wc, middle: wc - 0.02, staying: wc - 0.08 },
                  wJockey: { sprint: wj - 0.05, mile: wj, middle: wj + 0.02, staying: wj + 0.08 },
                  wEntraineur: { sprint: we, mile: we, middle: we, staying: we },
                  wIndiv: wi,
                  wCorde: { sprint: wcorde, mile: wcorde * 0.6, middle: wcorde * 0.3, staying: wcorde * 0.1 },
                  wPoids: { sprint: wpoids * 0.5, mile: wpoids, middle: wpoids * 1.3, staying: wpoids * 1.8 },
                  alpha,
                  temperature: temp
                };

                const result = evaluate(courses.slice(trainEnd, valEnd), JSON.parse(JSON.stringify(baseStats)), params, 0);
                tested++;

                // Score composite : maximiser top1 + top3, minimiser logLoss
                const composite = result.top1Rate * 2 + result.top3In3Rate - result.logLoss * 10;

                if (composite > bestScore) {
                  bestScore = composite;
                  bestConfig = { params, result };
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(`${tested} configurations testées\n`);

  console.log('=== MEILLEURE CONFIG (sur validation) ===');
  console.log(`Top 1 gagne : ${bestConfig.result.top1Rate}%`);
  console.log(`Top 3 in 3  : ${bestConfig.result.top3In3Rate}%`);
  console.log(`Log-loss    : ${bestConfig.result.logLoss}`);
  console.log(`Params :`);
  console.log(`  Cheval mile  : ${bestConfig.params.wCheval.mile}`);
  console.log(`  Jockey mile  : ${bestConfig.params.wJockey.mile}`);
  console.log(`  Entraîneur   : ${bestConfig.params.wEntraineur.mile}`);
  console.log(`  Indiv        : ${bestConfig.params.wIndiv}`);
  console.log(`  Corde sprint : ${bestConfig.params.wCorde.sprint}`);
  console.log(`  Poids staying: ${bestConfig.params.wPoids.staying}`);
  console.log(`  Alpha        : ${bestConfig.params.alpha}`);
  console.log(`  Temperature  : ${bestConfig.params.temperature}`);

  // Test final sur la période TEST (jamais vue pendant l'optimisation)
  console.log('\n=== RÉSULTAT FINAL SUR TEST (données jamais vues) ===');

  // Reconstruire les stats jusqu'à la fin de la validation
  const testStats = { cheval: {}, jockey: {}, entraineur: {}, combo: {} };
  for (let i = 0; i < valEnd; i++) {
    updateStats(courses[i], testStats);
  }

  const testResult = evaluate(courses.slice(valEnd), testStats, bestConfig.params, 0);
  console.log(`Courses test : ${testResult.total}`);
  console.log(`Top 1 gagne  : ${testResult.top1Rate}%`);
  console.log(`Top 3 in 3   : ${testResult.top3In3Rate}%`);
  console.log(`Log-loss     : ${testResult.logLoss}`);

  // Baseline random
  const avgPartants = courses.slice(valEnd).reduce((s, c) => s + c.participants.length, 0) / testResult.total;
  console.log(`Baseline rnd : ${(100 / avgPartants).toFixed(1)}% (${avgPartants.toFixed(0)} partants moy)`);
  console.log(`Baseline LL  : ${Math.log(avgPartants).toFixed(3)}`);

  // Comparaison avec config par défaut
  console.log('\n=== COMPARAISON AVEC CONFIG ACTUELLE ===');
  const defaultParams = {
    wCheval: { sprint: 0.55, mile: 0.50, middle: 0.48, staying: 0.42 },
    wJockey: { sprint: 0.15, mile: 0.20, middle: 0.22, staying: 0.28 },
    wEntraineur: { sprint: 0.15, mile: 0.15, middle: 0.15, staying: 0.15 },
    wIndiv: 1.0,
    wCorde: { sprint: 1.0, mile: 0.6, middle: 0.3, staying: 0.1 },
    wPoids: { sprint: 0.5, mile: 1.0, middle: 1.3, staying: 1.8 },
    alpha: 10,
    temperature: 5
  };

  const defaultTestStats = { cheval: {}, jockey: {}, entraineur: {}, combo: {} };
  for (let i = 0; i < valEnd; i++) {
    updateStats(courses[i], defaultTestStats);
  }
  const defaultResult = evaluate(courses.slice(valEnd), defaultTestStats, defaultParams, 0);
  console.log(`Config actuelle : top1=${defaultResult.top1Rate}% | top3in3=${defaultResult.top3In3Rate}% | LL=${defaultResult.logLoss}`);
  console.log(`Config optimisée: top1=${testResult.top1Rate}% | top3in3=${testResult.top3In3Rate}% | LL=${testResult.logLoss}`);

  const improvement = testResult.top1Rate - defaultResult.top1Rate;
  console.log(`\nAmélioration #1 : ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)} points`);

  // Sauvegarder
  const report = {
    date: new Date().toISOString(),
    tested_configs: tested,
    best_params: bestConfig.params,
    validation_result: bestConfig.result,
    test_result: testResult,
    default_result: defaultResult,
    baseline_random: +(100 / avgPartants).toFixed(1)
  };

  await fs.mkdir('./data/backtest', { recursive: true });
  await fs.writeFile('./data/backtest/optimization_report.json', JSON.stringify(report, null, 2));
  console.log('\n✅ Rapport sauvegardé → data/backtest/optimization_report.json');
}

main().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
