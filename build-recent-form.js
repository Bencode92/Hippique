// build-recent-form.js
// Calcule un indice de forme récente pour chaque cheval, jockey et entraîneur
// basé sur les fichiers de courses datés avec decay temporel exponentiel
const fs = require('fs').promises;
const path = require('path');

const COURSES_DIR = './data/courses';
const OUTPUT_DIR = './data';

// Decay factor : half-life de 30 jours
// Après 30 jours, une performance compte pour 50%
// Après 60 jours, 25%, après 90 jours ~12%
const HALF_LIFE_DAYS = 30;

function decayWeight(daysDiff) {
  return Math.pow(0.5, daysDiff / HALF_LIFE_DAYS);
}

// Parser la date du fichier (format: YYYY-MM-DD_hippodrome.json)
function parseDateFromFilename(filename) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  return new Date(match[1] + 'T12:00:00Z');
}

// Calculer le score de forme d'après la position
// Plus la position est bonne, plus le score est élevé
function positionToScore(position, nbPartants) {
  if (!position || position < 1 || !nbPartants || nbPartants < 2) return 0;

  if (position === 1) return 100;                            // Victoire
  if (position === 2) return 75;                             // 2ème
  if (position === 3) return 60;                             // 3ème
  if (position <= 5) return 40;                              // 4-5ème
  if (position <= Math.ceil(nbPartants / 2)) return 20;     // Première moitié
  return 5;                                                   // Deuxième moitié
}

// Nettoyer le nom du cheval
function cleanHorseName(raw) {
  if (!raw) return null;
  const match = raw.match(/^([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ\u0027' -]+?)(?:\s+[MHFG]\.|\s+\d+\s*a\.|\s*$)/i);
  if (match) return match[1].trim().toUpperCase();
  return raw.replace(/\s+[MHFG]\.\w+\.\s*\d+\s*a\..*$/, '').trim().toUpperCase();
}

function cleanName(raw) {
  if (!raw) return null;
  return raw.trim().toUpperCase();
}

async function main() {
  const today = new Date();
  console.log('=== CONSTRUCTION DES INDICES DE FORME RÉCENTE ===');
  console.log(`Date de référence: ${today.toISOString().split('T')[0]}`);

  const files = (await fs.readdir(COURSES_DIR)).filter(f => f.endsWith('.json'));
  console.log(`${files.length} fichiers de courses trouvés`);

  // Structure : { NOM: { performances: [{date, score, weight, position, distance, type}], ... } }
  const formeChevaux = {};
  const formeJockeys = {};
  const formeEntraineurs = {};

  let totalProcessed = 0;
  let skippedFiles = 0;

  for (const file of files) {
    const courseDate = parseDateFromFilename(file);
    if (!courseDate) { skippedFiles++; continue; }

    const daysDiff = Math.max(0, (today - courseDate) / (1000 * 60 * 60 * 24));
    const weight = decayWeight(daysDiff);

    // Ignorer les courses de plus de 6 mois (poids < 1.5%)
    if (weight < 0.015) continue;

    try {
      const data = JSON.parse(await fs.readFile(path.join(COURSES_DIR, file), 'utf8'));

      for (const course of (data.courses || [])) {
        const participants = course.participants || [];
        // Format standard seulement (avec jockey)
        if (!participants.length || !participants[0].jockey) continue;

        const nbPartants = participants.length;
        const distance = parseInt(String(course.distance || '').replace(/[^0-9]/g, '')) || 0;
        const type = course.type || 'Inconnu';

        participants.forEach((p, index) => {
          const position = parseInt(p['n°'] || (index + 1));
          if (!position || position < 1) return;

          totalProcessed++;
          const score = positionToScore(position, nbPartants);

          const addPerf = (store, name) => {
            if (!name) return;
            if (!store[name]) store[name] = { performances: [] };
            store[name].performances.push({
              date: courseDate.toISOString().split('T')[0],
              daysDiff: Math.round(daysDiff),
              position,
              nbPartants,
              score,
              weight: +weight.toFixed(4),
              weightedScore: +(score * weight).toFixed(2),
              distance,
              type
            });
          };

          addPerf(formeChevaux, cleanHorseName(p.cheval));
          addPerf(formeJockeys, cleanName(p.jockey));
          addPerf(formeEntraineurs, cleanName(p.entraineur || p['entraîneur']));
        });
      }
    } catch (err) {
      skippedFiles++;
    }
  }

  console.log(`${totalProcessed} participations analysées, ${skippedFiles} fichiers ignorés`);

  // Calculer l'indice de forme pour chaque acteur
  function computeFormIndex(store) {
    const result = {};

    for (const [name, data] of Object.entries(store)) {
      const perfs = data.performances;
      if (!perfs.length) continue;

      // Trier par date (plus récent en premier)
      perfs.sort((a, b) => b.date.localeCompare(a.date));

      // Score de forme pondéré par le temps
      const totalWeight = perfs.reduce((s, p) => s + p.weight, 0);
      const weightedScoreSum = perfs.reduce((s, p) => s + p.weightedScore, 0);
      const formeScore = totalWeight > 0 ? +(weightedScoreSum / totalWeight).toFixed(1) : 0;

      // Tendance : comparer les 3 dernières vs les 3 précédentes
      let tendance = 'stable';
      if (perfs.length >= 4) {
        const recent3 = perfs.slice(0, 3);
        const previous3 = perfs.slice(3, 6);
        const avgRecent = recent3.reduce((s, p) => s + p.score, 0) / recent3.length;
        const avgPrevious = previous3.reduce((s, p) => s + p.score, 0) / (previous3.length || 1);
        const diff = avgRecent - avgPrevious;

        if (diff > 15) tendance = 'forte_hausse';       // +15 pts = nette progression
        else if (diff > 5) tendance = 'hausse';          // +5 pts
        else if (diff < -15) tendance = 'forte_baisse';  // -15 pts = nette régression
        else if (diff < -5) tendance = 'baisse';         // -5 pts
      }

      // Dernière course
      const derniereCourse = perfs[0];

      // Nombre de victoires récentes (poids > 0.3 = ~52 jours)
      const victoiresRecentes = perfs.filter(p => p.position === 1 && p.weight > 0.3).length;
      const placesRecents = perfs.filter(p => p.position <= 3 && p.weight > 0.3).length;

      // Régularité (écart-type des scores récents)
      const recentPerfs = perfs.slice(0, Math.min(5, perfs.length));
      const avgScore = recentPerfs.reduce((s, p) => s + p.score, 0) / recentPerfs.length;
      const variance = recentPerfs.reduce((s, p) => s + Math.pow(p.score - avgScore, 2), 0) / recentPerfs.length;
      const regularite = Math.max(0, +(100 - Math.sqrt(variance)).toFixed(1));

      result[name] = {
        formeScore,
        tendance,
        regularite,
        nbCoursesRecentes: perfs.length,
        victoiresRecentes,
        placesRecents,
        derniereCourse: {
          date: derniereCourse.date,
          joursDepuis: derniereCourse.daysDiff,
          position: derniereCourse.position,
          nbPartants: derniereCourse.nbPartants,
          distance: derniereCourse.distance,
          type: derniereCourse.type
        },
        dernieres5: perfs.slice(0, 5).map(p => ({
          date: p.date,
          position: p.position,
          nbPartants: p.nbPartants,
          score: p.score,
          distance: p.distance
        }))
      };
    }

    return result;
  }

  const chevauxForme = computeFormIndex(formeChevaux);
  const jockeysForme = computeFormIndex(formeJockeys);
  const entraineursForme = computeFormIndex(formeEntraineurs);

  // Écrire les fichiers
  const writeOutput = async (filename, category, data) => {
    const output = {
      metadata: {
        category,
        extraction_date: new Date().toISOString(),
        method: 'recent_form_analysis',
        date_reference: today.toISOString().split('T')[0],
        decay_half_life_days: HALF_LIFE_DAYS,
        participations_analysees: totalProcessed,
        fichiers_source: files.length
      },
      resultats: data
    };
    await fs.writeFile(path.join(OUTPUT_DIR, filename), JSON.stringify(output, null, 2));
    console.log(`  → ${filename} (${Object.keys(data).length} entrées)`);
  };

  console.log('\nÉcriture des fichiers :');
  await writeOutput('chevaux_forme_recente.json', 'chevaux', chevauxForme);
  await writeOutput('jockeys_forme_recente.json', 'jockeys', jockeysForme);
  await writeOutput('entraineurs_forme_recente.json', 'entraineurs', entraineursForme);

  // Afficher des exemples de tendance
  console.log('\n=== EXEMPLES DE FORME ===');

  // Top 5 chevaux en hausse
  const chevauxHausse = Object.entries(chevauxForme)
    .filter(([_, v]) => v.tendance === 'forte_hausse' && v.nbCoursesRecentes >= 4)
    .sort((a, b) => b[1].formeScore - a[1].formeScore)
    .slice(0, 5);

  if (chevauxHausse.length) {
    console.log('\n📈 Chevaux en FORTE HAUSSE :');
    chevauxHausse.forEach(([nom, s]) => {
      const last5 = s.dernieres5.map(p => p.position).join('-');
      console.log(`  ${nom}: forme ${s.formeScore}/100, positions: ${last5}, ${s.victoiresRecentes} victoires récentes`);
    });
  }

  // Top 5 chevaux en baisse
  const chevauxBaisse = Object.entries(chevauxForme)
    .filter(([_, v]) => v.tendance === 'forte_baisse' && v.nbCoursesRecentes >= 4)
    .sort((a, b) => a[1].formeScore - b[1].formeScore)
    .slice(0, 5);

  if (chevauxBaisse.length) {
    console.log('\n📉 Chevaux en FORTE BAISSE :');
    chevauxBaisse.forEach(([nom, s]) => {
      const last5 = s.dernieres5.map(p => p.position).join('-');
      console.log(`  ${nom}: forme ${s.formeScore}/100, positions: ${last5}`);
    });
  }

  // Exemple spécifique de jockey
  const guyon = jockeysForme['M.GUYON'];
  if (guyon) {
    console.log('\n=== EXEMPLE JOCKEY : M.GUYON ===');
    console.log(`  Forme: ${guyon.formeScore}/100 | Tendance: ${guyon.tendance} | Régularité: ${guyon.regularite}/100`);
    console.log(`  ${guyon.victoiresRecentes} victoires récentes, ${guyon.placesRecents} places`);
    console.log(`  Dernières 5: ${guyon.dernieres5.map(p => `${p.position}/${p.nbPartants}`).join(', ')}`);
  }

  console.log('\n✅ Indices de forme récente générés avec succès !');
}

main().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
