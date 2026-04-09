// build-stable-form.js
// Calcule la forme récente de chaque ÉCURIE (entraîneur)
// + l'intervalle entre courses pour chaque cheval
// Un entraîneur dont l'écurie gagne = tous ses chevaux en bénéficient
const fs = require('fs').promises;
const path = require('path');

const COURSES_DIR = './data/courses';
const OUTPUT_DIR = './data';

function cleanName(raw) {
  return raw ? raw.trim().toUpperCase() : null;
}

function cleanHorseName(raw) {
  if (!raw) return null;
  return raw.replace(/\s+[MHFG]\.[A-Z]*\.?\s*\d*\s*a\.?.*/i, '').trim().toUpperCase();
}

function parseDateFromFilename(filename) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? new Date(match[1] + 'T12:00:00Z') : null;
}

async function main() {
  const today = new Date();
  console.log('=== CONSTRUCTION FORME STABLE + INTERVALLE COURSES ===');

  const files = (await fs.readdir(COURSES_DIR)).filter(f => f.endsWith('.json')).sort();
  console.log(`${files.length} fichiers de courses`);

  // 1. FORME STABLE PAR ENTRAÎNEUR (derniers 30 jours)
  // Pour chaque entraîneur : combien de courses, victoires, places ces 30 derniers jours
  const stableForm = {};

  // 2. DERNIÈRE COURSE PAR CHEVAL (pour calculer l'intervalle)
  const lastRace = {}; // cheval → { date, joursDepuis, position, nbPartants }

  for (const file of files) {
    const courseDate = parseDateFromFilename(file);
    if (!courseDate) continue;

    const daysDiff = Math.max(0, (today - courseDate) / (1000 * 60 * 60 * 24));

    try {
      const data = JSON.parse(await fs.readFile(path.join(COURSES_DIR, file), 'utf8'));

      for (const course of (data.courses || [])) {
        const participants = course.participants || [];
        if (!participants.length || !participants[0].jockey) continue;

        for (const p of participants) {
          const entraineur = cleanName(p.entraineur || p['entraîneur']);
          const cheval = cleanHorseName(p.cheval);
          const position = parseInt(p['n°'] || 0);
          if (!position || position < 1) continue;

          // Forme stable (30 derniers jours seulement)
          if (entraineur && daysDiff <= 30) {
            if (!stableForm[entraineur]) {
              stableForm[entraineur] = { courses: 0, victoires: 0, places: 0, top5: 0, chevaux: new Set() };
            }
            stableForm[entraineur].courses++;
            if (position === 1) stableForm[entraineur].victoires++;
            if (position <= 3) stableForm[entraineur].places++;
            if (position <= 5) stableForm[entraineur].top5++;
            stableForm[entraineur].chevaux.add(cheval);
          }

          // Dernière course du cheval (prendre la plus récente)
          if (cheval) {
            const dateStr = courseDate.toISOString().split('T')[0];
            if (!lastRace[cheval] || dateStr > lastRace[cheval].date) {
              lastRace[cheval] = {
                date: dateStr,
                joursDepuis: Math.round(daysDiff),
                position,
                nbPartants: participants.length,
                hippodrome: data.hippodrome || '',
                distance: course.distance || ''
              };
            }
          }
        }
      }
    } catch (e) {}
  }

  // Formater les résultats
  const stableFormResult = {};
  for (const [name, stats] of Object.entries(stableForm)) {
    if (stats.courses < 3) continue;
    stableFormResult[name] = {
      courses30j: stats.courses,
      victoires30j: stats.victoires,
      places30j: stats.places,
      tauxVictoire30j: +(stats.victoires / stats.courses * 100).toFixed(1),
      tauxPlace30j: +(stats.places / stats.courses * 100).toFixed(1),
      nbChevaux: stats.chevaux.size,
      // Indice de forme : 0-100
      formeStable: +Math.min(100, (stats.victoires / stats.courses * 200) + (stats.places / stats.courses * 50)).toFixed(1)
    };
  }

  const intervalleResult = {};
  for (const [name, info] of Object.entries(lastRace)) {
    // Calculer la catégorie d'intervalle
    let categorie;
    if (info.joursDepuis <= 7) categorie = 'tres_frais';       // Trop serré
    else if (info.joursDepuis <= 14) categorie = 'frais';       // Bon rythme
    else if (info.joursDepuis <= 25) categorie = 'ideal';       // Idéal (15-25j)
    else if (info.joursDepuis <= 45) categorie = 'repos';       // Repos normal
    else if (info.joursDepuis <= 90) categorie = 'long_repos';  // Long repos
    else categorie = 'tres_long_repos';                          // Très long repos

    intervalleResult[name] = {
      ...info,
      categorie
    };
  }

  // Sauvegarder
  const outputStable = {
    metadata: {
      extraction_date: new Date().toISOString(),
      method: 'stable_form_30days',
      entraineurs: Object.keys(stableFormResult).length
    },
    resultats: stableFormResult
  };

  const outputIntervalle = {
    metadata: {
      extraction_date: new Date().toISOString(),
      method: 'intervalle_courses',
      chevaux: Object.keys(intervalleResult).length
    },
    resultats: intervalleResult
  };

  await fs.writeFile(path.join(OUTPUT_DIR, 'stable_form.json'), JSON.stringify(outputStable, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'intervalle_courses.json'), JSON.stringify(outputIntervalle, null, 2));

  console.log(`\n✅ Forme stable: ${Object.keys(stableFormResult).length} entraîneurs`);
  console.log(`✅ Intervalle: ${Object.keys(intervalleResult).length} chevaux`);

  // Exemples
  const topStable = Object.entries(stableFormResult)
    .sort((a, b) => b[1].formeStable - a[1].formeStable)
    .slice(0, 10);

  console.log('\n=== TOP 10 ÉCURIES EN FORME (30 jours) ===');
  topStable.forEach(([name, s]) => {
    console.log(`  ${name}: ${s.courses30j}c ${s.victoires30j}V (${s.tauxVictoire30j}%) ${s.nbChevaux} chevaux → forme ${s.formeStable}`);
  });

  // Exemples intervalle
  console.log('\n=== EXEMPLES INTERVALLE ===');
  const examples = Object.entries(intervalleResult).slice(0, 5);
  examples.forEach(([name, info]) => {
    console.log(`  ${name}: dernière course il y a ${info.joursDepuis}j → ${info.categorie}`);
  });
}

main().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
