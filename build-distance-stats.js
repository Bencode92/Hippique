// build-distance-stats.js
// Agrège les stats par distance pour chaque jockey, cheval, entraîneur
// à partir des 439 fichiers de courses historiques
const fs = require('fs').promises;
const path = require('path');

const COURSES_DIR = './data/courses';
const OUTPUT_DIR = './data';

// Buckets de distance
function getDistanceBucket(distanceStr) {
  const m = parseInt(String(distanceStr).replace(/[^0-9]/g, ''));
  if (!m || m < 800) return null;
  if (m < 1400) return 'sprint';      // < 1400m
  if (m < 1900) return 'mile';        // 1400-1899m
  if (m < 2400) return 'intermediaire'; // 1900-2399m
  return 'staying';                     // 2400m+
}

function getDistanceLabel(bucket) {
  const labels = {
    sprint: '<1400m',
    mile: '1400-1899m',
    intermediaire: '1900-2399m',
    staying: '2400m+'
  };
  return labels[bucket] || bucket;
}

// Nettoyer le nom du cheval (enlever suffixes comme "M.PU. 3 a.")
function cleanHorseName(raw) {
  if (!raw) return null;
  // Enlever les infos après le nom : "TONNANT M.PU. 3 a." → "TONNANT"
  // Pattern : NOM [SEXE].[RACE]. [AGE] a.
  const match = raw.match(/^([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ' -]+?)(?:\s+[MHFG]\.|\s+\d+\s*a\.|\s*$)/i);
  if (match) return match[1].trim().toUpperCase();
  // Fallback : prendre tout avant le premier point ou chiffre suivi de "a."
  return raw.replace(/\s+[MHFG]\.\w+\.\s*\d+\s*a\..*$/, '').trim().toUpperCase();
}

// Nettoyer le nom du jockey (normaliser la casse)
function cleanName(raw) {
  if (!raw) return null;
  return raw.trim().toUpperCase();
}

async function main() {
  console.log('=== CONSTRUCTION DES STATS PAR DISTANCE ===');

  const files = (await fs.readdir(COURSES_DIR)).filter(f => f.endsWith('.json'));
  console.log(`${files.length} fichiers de courses trouvés`);

  // Accumulateurs : { "NOM" : { sprint: {courses, victoires, places, top3}, mile: {...}, ... } }
  const statsJockeys = {};
  const statsChevaux = {};
  const statsEntraineurs = {};

  let totalCourses = 0;
  let totalParticipations = 0;
  let skipped = 0;

  for (const file of files) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(COURSES_DIR, file), 'utf8'));
      const courses = data.courses || [];

      for (const course of courses) {
        const distance = course.distance;
        const bucket = getDistanceBucket(distance);
        const type = course.type || 'Inconnu';

        if (!bucket) { skipped++; continue; }

        const participants = course.participants || [];
        // Vérifier le format : format standard français a le champ "n°" et "jockey"
        if (!participants.length || !participants[0].jockey) continue;

        totalCourses++;
        const nbPartants = participants.length;

        participants.forEach((p, index) => {
          const position = parseInt(p['n°'] || (index + 1));
          if (!position || position < 1) return;

          totalParticipations++;

          const jockey = cleanName(p.jockey);
          const cheval = cleanHorseName(p.cheval);
          const entraineur = cleanName(p.entraineur || p['entraîneur']);

          const isVictoire = position === 1;
          const isPlace = position <= 3;
          const isTop5 = position <= 5;

          // Mettre à jour les stats pour chaque acteur
          const updateStats = (store, name) => {
            if (!name) return;
            if (!store[name]) store[name] = {};
            if (!store[name][bucket]) {
              store[name][bucket] = {
                courses: 0, victoires: 0, places: 0, top5: 0,
                type_course: {}, distances_exactes: []
              };
            }
            const s = store[name][bucket];
            s.courses++;
            if (isVictoire) s.victoires++;
            if (isPlace) s.places++;
            if (isTop5) s.top5++;

            // Tracker les types de course
            s.type_course[type] = (s.type_course[type] || 0) + 1;

            // Garder la distance exacte pour analyse fine
            const distExacte = parseInt(String(distance).replace(/[^0-9]/g, ''));
            if (!s.distances_exactes.includes(distExacte)) {
              s.distances_exactes.push(distExacte);
            }
          };

          updateStats(statsJockeys, jockey);
          updateStats(statsChevaux, cheval);
          updateStats(statsEntraineurs, entraineur);
        });
      }
    } catch (err) {
      // Fichier invalide ou format étranger, on skip
      skipped++;
    }
  }

  console.log(`${totalCourses} courses analysées, ${totalParticipations} participations`);
  console.log(`${skipped} courses/fichiers ignorés (format étranger ou distance invalide)`);

  // Calculer les taux et formater la sortie
  function formatStats(store) {
    const result = {};
    for (const [name, buckets] of Object.entries(store)) {
      result[name] = { global: { courses: 0, victoires: 0, places: 0, top5: 0 } };

      for (const [bucket, stats] of Object.entries(buckets)) {
        const tauxVictoire = stats.courses > 0 ? +(stats.victoires / stats.courses * 100).toFixed(1) : 0;
        const tauxPlace = stats.courses > 0 ? +(stats.places / stats.courses * 100).toFixed(1) : 0;
        const tauxTop5 = stats.courses > 0 ? +(stats.top5 / stats.courses * 100).toFixed(1) : 0;

        result[name][bucket] = {
          label: getDistanceLabel(bucket),
          courses: stats.courses,
          victoires: stats.victoires,
          places: stats.places,
          top5: stats.top5,
          tauxVictoire,
          tauxPlace,
          tauxTop5,
          type_course: stats.type_course
        };

        // Accumuler les globaux
        result[name].global.courses += stats.courses;
        result[name].global.victoires += stats.victoires;
        result[name].global.places += stats.places;
        result[name].global.top5 += stats.top5;
      }

      // Calculer les taux globaux
      const g = result[name].global;
      g.tauxVictoire = g.courses > 0 ? +(g.victoires / g.courses * 100).toFixed(1) : 0;
      g.tauxPlace = g.courses > 0 ? +(g.places / g.courses * 100).toFixed(1) : 0;

      // Identifier la meilleure distance
      let bestBucket = null;
      let bestRate = -1;
      for (const bucket of ['sprint', 'mile', 'intermediaire', 'staying']) {
        if (result[name][bucket] && result[name][bucket].courses >= 3) {
          if (result[name][bucket].tauxVictoire > bestRate) {
            bestRate = result[name][bucket].tauxVictoire;
            bestBucket = bucket;
          }
        }
      }
      result[name].meilleureDistance = bestBucket ? {
        bucket: bestBucket,
        label: getDistanceLabel(bestBucket),
        tauxVictoire: bestRate
      } : null;
    }
    return result;
  }

  const jockeysFormatted = formatStats(statsJockeys);
  const chevauxFormatted = formatStats(statsChevaux);
  const entraineursFormatted = formatStats(statsEntraineurs);

  // Écrire les fichiers
  const writeOutput = async (filename, category, data) => {
    const output = {
      metadata: {
        category,
        extraction_date: new Date().toISOString(),
        method: 'distance_stats_aggregation',
        courses_analysees: totalCourses,
        participations: totalParticipations,
        fichiers_source: files.length,
        distance_buckets: {
          sprint: '<1400m',
          mile: '1400-1899m',
          intermediaire: '1900-2399m',
          staying: '2400m+'
        }
      },
      resultats: data
    };
    await fs.writeFile(path.join(OUTPUT_DIR, filename), JSON.stringify(output, null, 2));
    console.log(`  → ${filename} (${Object.keys(data).length} entrées)`);
  };

  console.log('\nÉcriture des fichiers :');
  await writeOutput('jockeys_distance_stats.json', 'jockeys', jockeysFormatted);
  await writeOutput('chevaux_distance_stats.json', 'chevaux', chevauxFormatted);
  await writeOutput('entraineurs_distance_stats.json', 'entraineurs', entraineursFormatted);

  // Afficher un exemple : Barzalona si présent
  const barzalona = jockeysFormatted['M.BARZALONA'] || jockeysFormatted['BARZALONA'];
  if (barzalona) {
    console.log('\n=== EXEMPLE : BARZALONA ===');
    for (const bucket of ['sprint', 'mile', 'intermediaire', 'staying']) {
      if (barzalona[bucket]) {
        const s = barzalona[bucket];
        console.log(`  ${s.label}: ${s.courses} courses, ${s.victoires} victoires (${s.tauxVictoire}%), ${s.places} placés (${s.tauxPlace}%)`);
      }
    }
    if (barzalona.meilleureDistance) {
      console.log(`  → Meilleure distance : ${barzalona.meilleureDistance.label} (${barzalona.meilleureDistance.tauxVictoire}% victoires)`);
    }
  }

  console.log('\n✅ Stats par distance générées avec succès !');
}

main().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
