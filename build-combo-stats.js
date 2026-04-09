// build-combo-stats.js
// Calcule les stats des combos jockey × entraîneur à partir des courses historiques
const fs = require('fs').promises;
const path = require('path');

const COURSES_DIR = './data/courses';
const OUTPUT_DIR = './data';

function cleanName(raw) {
  if (!raw) return null;
  return raw.trim().toUpperCase();
}

async function main() {
  console.log('=== CONSTRUCTION DES STATS JOCKEY × ENTRAÎNEUR ===');

  const files = (await fs.readdir(COURSES_DIR)).filter(f => f.endsWith('.json'));
  console.log(`${files.length} fichiers de courses`);

  const combos = {};
  let totalParticipations = 0;

  for (const file of files) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(COURSES_DIR, file), 'utf8'));

      for (const course of (data.courses || [])) {
        if (!['Plat', 'Obstacle'].includes(course.type)) continue;
        const participants = course.participants || [];
        if (!participants.length || !participants[0].jockey) continue;

        const nbPartants = participants.length;
        const distance = parseInt(String(course.distance || '').replace(/[^0-9]/g, '')) || 0;
        const distBucket = distance < 1400 ? 'sprint' : distance < 1900 ? 'mile' : distance < 2400 ? 'intermediaire' : 'staying';

        for (const p of participants) {
          const jockey = cleanName(p.jockey);
          const entraineur = cleanName(p.entraineur || p['entraîneur']);
          if (!jockey || !entraineur || jockey.length < 3 || entraineur.length < 3) continue;

          const position = parseInt(p['n°'] || 0);
          if (!position || position < 1) continue;

          totalParticipations++;
          const key = `${jockey}|||${entraineur}`;

          if (!combos[key]) {
            combos[key] = {
              jockey,
              entraineur,
              courses: 0,
              victoires: 0,
              places: 0,
              top5: 0,
              byDistance: {}
            };
          }

          const c = combos[key];
          c.courses++;
          if (position === 1) c.victoires++;
          if (position <= 3) c.places++;
          if (position <= 5) c.top5++;

          // Stats par distance
          if (!c.byDistance[distBucket]) {
            c.byDistance[distBucket] = { courses: 0, victoires: 0, places: 0 };
          }
          c.byDistance[distBucket].courses++;
          if (position === 1) c.byDistance[distBucket].victoires++;
          if (position <= 3) c.byDistance[distBucket].places++;
        }
      }
    } catch (e) {}
  }

  console.log(`${totalParticipations} participations analysées`);
  console.log(`${Object.keys(combos).length} combos uniques`);

  // Calculer les taux et formater
  const result = {};
  let significantCount = 0;

  for (const [key, c] of Object.entries(combos)) {
    if (c.courses < 3) continue; // Minimum 3 courses pour être significatif
    significantCount++;

    const tauxVictoire = +(c.victoires / c.courses * 100).toFixed(1);
    const tauxPlace = +(c.places / c.courses * 100).toFixed(1);

    // Clé de lookup : JOCKEY|||ENTRAINEUR
    result[key] = {
      jockey: c.jockey,
      entraineur: c.entraineur,
      courses: c.courses,
      victoires: c.victoires,
      places: c.places,
      tauxVictoire,
      tauxPlace,
      byDistance: {}
    };

    for (const [dist, stats] of Object.entries(c.byDistance)) {
      if (stats.courses >= 2) {
        result[key].byDistance[dist] = {
          courses: stats.courses,
          victoires: stats.victoires,
          tauxVictoire: +(stats.victoires / stats.courses * 100).toFixed(1)
        };
      }
    }
  }

  console.log(`${significantCount} combos significatifs (3+ courses)`);

  // Sauvegarder
  const output = {
    metadata: {
      extraction_date: new Date().toISOString(),
      method: 'combo_jockey_entraineur',
      participations_analysees: totalParticipations,
      combos_total: Object.keys(combos).length,
      combos_significatifs: significantCount
    },
    resultats: result
  };

  const outFile = path.join(OUTPUT_DIR, 'combo_jockey_entraineur.json');
  await fs.writeFile(outFile, JSON.stringify(output, null, 2));
  console.log(`\n✅ Sauvegardé → ${outFile}`);

  // Afficher les meilleurs duos
  const top = Object.values(result)
    .filter(c => c.courses >= 5)
    .sort((a, b) => b.tauxVictoire - a.tauxVictoire || b.courses - a.courses)
    .slice(0, 10);

  console.log('\n=== TOP 10 DUOS (5+ courses) ===');
  top.forEach(c => {
    console.log(`  ${c.jockey} × ${c.entraineur}: ${c.courses}c ${c.victoires}V ${c.tauxVictoire}% vict ${c.tauxPlace}% place`);
  });
}

main().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
