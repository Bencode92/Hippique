// extract-pondered-rankings.js
const fs = require('fs').promises;
const path = require('path');
const https = require('https');

// Configuration
const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/bencode92/Hippique/main/';
const OUTPUT_DIR = './data';
// Catégories à traiter — inclut 2025 si les fichiers existent
const CATEGORIES = [
  { id: 'jockeys', file: 'data/jockeys.json' },
  { id: 'chevaux', file: 'data/chevaux.json' },
  { id: 'entraineurs', file: 'data/entraineurs.json' },
  { id: 'eleveurs', file: 'data/eleveurs.json' },
  { id: 'proprietaires', file: 'data/proprietaires.json' },
  { id: 'cravache_or', file: 'data/cravache_or.json' },
  // Données historiques 2025 (année complète = stats plus fiables)
  { id: 'jockeys_2025', file: 'data/jockeys_2025.json' },
  { id: 'chevaux_2025', file: 'data/chevaux_2025.json' },
  { id: 'entraineurs_2025', file: 'data/entraineurs_2025.json' },
  { id: 'eleveurs_2025', file: 'data/eleveurs_2025.json' },
  { id: 'proprietaires_2025', file: 'data/proprietaires_2025.json' },
  { id: 'cravache_or_2025', file: 'data/cravache_or_2025.json' }
];

// Télécharger un fichier JSON depuis GitHub
async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Erreur HTTP ${res.statusCode} pour ${url}`));
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Erreur de parsing JSON: ${err.message}`));
        }
      });
    }).on('error', err => reject(err));
  });
}

// Calculer le classement dense (sans sauts) pour tous les types de tri
function rankWithTiesDense(items, valueGetter, category) {
  // Trier d'abord par la valeur (décroissante)
  const sorted = [...items].sort((a, b) => {
    const valA = valueGetter(a);
    const valB = valueGetter(b);
    const diff = valB - valA;
    
    // En cas d'égalité, trier par nom pour garantir la stabilité
    if (diff === 0) {
      const nameA = category === 'chevaux' ? a.Nom : a.NomPostal;
      const nameB = category === 'chevaux' ? b.Nom : b.NomPostal;
      return nameA.localeCompare(nameB);
    }
    return diff;
  });
  
  // Assigner les rangs sans sauts (classement dense)
  const ranks = new Map();
  let currentRank = 1;
  let currentValue = null;
  let sameRankCount = 0;
  
  sorted.forEach((item, index) => {
    const key = category === 'chevaux' ? item.Nom : item.NomPostal;
    const value = valueGetter(item);
    
    if (index === 0 || value !== currentValue) {
      // Nouvelle valeur = nouveau rang, mais sans saut
      currentRank = index + 1 - sameRankCount;
      currentValue = value;
      sameRankCount = 0;
    } else {
      // Même valeur = même rang
      sameRankCount++;
    }
    
    ranks.set(key, currentRank);
  });
  
  return ranks;
}

// Calculer le classement pondéré pour les données d'une catégorie
function calculateCompositeRanking(data, category) {
  if (!data || !data.length) return data;

  // Normaliser la catégorie (chevaux_2025 → chevaux pour le traitement)
  const baseCategory = category.replace(/_\d{4}$/, '');

  // Cloner les données pour ne pas modifier les originales
  const dataCopy = JSON.parse(JSON.stringify(data));

  // Fonctions d'accès aux différentes métriques selon la catégorie
  const victoryGetter = item => {
    return baseCategory === 'chevaux' ?
      parseInt(item.NbVictoires || 0) :
      parseInt(item.Victoires || 0);
  };
  
  const victoryRateGetter = item => parseFloat(item.TauxVictoire || 0);
  const placeRateGetter = item => parseFloat(item.TauxPlace || 0);
  const gainMoyenGetter = item => parseFloat(item.GainMoyen || 0);

  // Calcul des rangs pour chaque métrique avec gestion des égalités DENSE
  const victoryRanks = rankWithTiesDense(dataCopy, victoryGetter, baseCategory);
  const victoryRateRanks = rankWithTiesDense(dataCopy, victoryRateGetter, baseCategory);
  const placeRateRanks = rankWithTiesDense(dataCopy, placeRateGetter, baseCategory);
  const gainMoyenRanks = rankWithTiesDense(dataCopy, gainMoyenGetter, baseCategory);

  // Calcul du score pondéré pour chaque participant
  dataCopy.forEach(item => {
    const key = baseCategory === 'chevaux' ? item.Nom : item.NomPostal;
    
    if (!key) {
      item.ScoreMixte = 999; // Valeur par défaut pour les items mal formés
      return;
    }
    
    // Récupérer les rangs avec égalités DENSES
    const rangVictoires = victoryRanks.get(key) || 999;
    const rangTauxVictoire = victoryRateRanks.get(key) || 999;
    const rangTauxPlace = placeRateRanks.get(key) || 999;
    const rangGainMoyen = gainMoyenRanks.get(key) || 999;

    // Déterminer si l'élément a un taux de victoire parfait
    const nbCourses = baseCategory === 'chevaux' ?
      parseInt(item.NbCourses || 0) :
      parseInt(item.Partants || 0);
    const nbVictoires = baseCategory === 'chevaux' ?
      parseInt(item.NbVictoires || 0) :
      parseInt(item.Victoires || 0);
    const nbPlaces = baseCategory === 'chevaux' ?
      parseInt(item.NbPlace || 0) :
      parseInt(item.Place || 0);

    const hasPerfectWinRate = nbCourses > 0 && nbVictoires === nbCourses && nbPlaces === 0;

    // Pondération adaptative avec gain moyen (niveau des courses)
    let poidsV = 0.40;   // Poids pour les victoires
    let poidsTV = 0.25;  // Poids pour le taux de victoire
    let poidsTP = 0.15;  // Poids pour le taux de place
    let poidsGM = 0.20;  // Poids pour le gain moyen (niveau de course)

    // Si taux de victoire parfait, redistribuer le poids du taux de place
    if (hasPerfectWinRate) {
      poidsV += poidsTP; // Redistribuer le poids du taux de place vers les victoires
      poidsTP = 0;       // Ignorer le taux de place
    }

    // Calcul du score pondéré avec rangs DENSES (inclut le gain moyen)
    item.ScoreMixte = (
      poidsV * rangVictoires +
      poidsTV * rangTauxVictoire +
      poidsTP * rangTauxPlace +
      poidsGM * rangGainMoyen
    ).toFixed(2);
  });
  
  // Tri final par score mixte croissant (meilleur score = plus petit)
  const sortedData = dataCopy.sort((a, b) => {
    const diff = parseFloat(a.ScoreMixte || 999) - parseFloat(b.ScoreMixte || 999);
    if (diff !== 0) return diff;
    
    // Départage par nom en cas d'égalité
    const nameA = baseCategory === 'chevaux' ? a.Nom : a.NomPostal;
    const nameB = baseCategory === 'chevaux' ? b.Nom : b.NomPostal;
    return nameA.localeCompare(nameB);
  });
  
  // Assigner les rangs finaux
  let distinctRank = 0;
  let currentScore = null;
  
  sortedData.forEach((item, index) => {
    const score = parseFloat(item.ScoreMixte || 999);
    
    // Si nouveau score, incrémenter le rang distinct
    if (index === 0 || Math.abs(score - currentScore) > 0.001) {
      distinctRank++;
      currentScore = score;
    }
    
    item.Rang = distinctRank;
  });
  
  return sortedData;
}

// Prétraiter les données brutes avant calcul du classement pondéré
function preprocessData(data, category) {
  if (!data.resultats || !Array.isArray(data.resultats)) {
    console.error(`Données invalides pour ${category}: pas de resultats ou pas un tableau`);
    return [];
  }

  // Normaliser la catégorie (chevaux_2025 → chevaux pour le traitement)
  const baseCategory = category.replace(/_\d{4}$/, '');

  // Pour les chevaux, structure différente
  if (baseCategory === 'chevaux') {
    return data.resultats.map(item => {
      const nbCourses = parseInt(item.NbCourses || 0);
      const nbVictoires = parseInt(item.NbVictoires || 0);
      const nbPlace = parseInt(item.NbPlace || 0);
      
      // Calculer les taux
      const tauxVictoire = nbCourses > 0 ? ((nbVictoires / nbCourses) * 100).toFixed(1) : "0.0";
      const tauxPlace = nbCourses > 0 ? ((nbPlace / nbCourses) * 100).toFixed(1) : "0.0";
      
      // Récupérer le gain moyen par course (indicateur du niveau des courses)
      const gainMoyen = parseFloat(
        String(item['Gain moyen'] || 0).replace(/\s/g, '').replace(',', '.')
      ) || 0;

      return {
        Nom: item.LibelleCheval || item.Nom || "Inconnu",
        LibelleCheval_url: item.LibelleCheval_url,
        NbCourses: nbCourses,
        NbVictoires: nbVictoires,
        NbPlace: nbPlace,
        TauxVictoire: tauxVictoire,
        TauxPlace: tauxPlace,
        GainMoyen: gainMoyen
      };
    });
  } else {
    // Pour les autres catégories (structure standard)
    return data.resultats.map(item => {
      const partants = parseInt(item.Partants || 0);
      const victoires = parseInt(item.Victoires || 0);
      const place = parseInt(item.Place || 0);
      
      // Calculer les taux
      const tauxVictoire = partants > 0 ? ((victoires / partants) * 100).toFixed(1) : "0.0";
      const tauxPlace = partants > 0 ? ((place / partants) * 100).toFixed(1) : "0.0";
      
      // Récupérer le gain par partant (indicateur du niveau des courses)
      const gainMoyen = parseFloat(
        String(item['Gain/Part.'] || 0).replace(/\s/g, '').replace(',', '.')
      ) || 0;

      return {
        ...item,
        Partants: partants,
        Victoires: victoires,
        Place: place,
        TauxVictoire: tauxVictoire,
        TauxPlace: tauxPlace,
        GainMoyen: gainMoyen
      };
    });
  }
}

// Fonction principale pour traiter une catégorie
async function processCategory(category) {
  try {
    console.log(`Traitement de la catégorie ${category.id}...`);
    
    // Télécharger les données depuis GitHub
    const url = GITHUB_BASE_URL + category.file;
    const jsonData = await fetchJson(url);
    
    // Prétraiter les données
    const processedData = preprocessData(jsonData, category.id);
    
    // Calculer le classement pondéré
    const rankedData = calculateCompositeRanking(processedData, category.id);
    
    // Créer l'objet de résultat
    const result = {
      metadata: {
        category: category.id,
        extraction_date: new Date().toISOString(),
        extraction_method: "pondered_ranking",
        source_file: category.file,
        totalPopulation: rankedData.length
      },
      resultats: rankedData
    };
    
    // Générer les noms de fichiers
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const latestFile = path.join(OUTPUT_DIR, `${category.id}_ponderated_latest.json`);

    // Snapshot historique dans data/rankings/YYYY-MM-DD/
    const snapshotDir = path.join(OUTPUT_DIR, 'rankings', today);
    await fs.mkdir(snapshotDir, { recursive: true });
    const snapshotFile = path.join(snapshotDir, `${category.id}.json`);

    // Écrire les fichiers
    await fs.writeFile(snapshotFile, JSON.stringify(result, null, 2));
    await fs.writeFile(latestFile, JSON.stringify(result, null, 2));
    console.log(`  📸 Snapshot: ${snapshotFile}`);
    
    console.log(`✅ Catégorie ${category.id} traitée avec succès.`);
    return { category: category.id, success: true };
  } catch (error) {
    console.error(`❌ Erreur lors du traitement de ${category.id}:`, error.message);
    return { category: category.id, success: false, error: error.message };
  }
}

// Fonction principale
async function main() {
  console.log("=== EXTRACTION DES CLASSEMENTS PONDÉRÉS ===");
  console.log(`Date: ${new Date().toLocaleString()}`);
  
  try {
    // Créer le dossier de sortie s'il n'existe pas
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Traiter toutes les catégories en parallèle
    const results = await Promise.all(CATEGORIES.map(category => processCategory(category)));
    
    // Afficher le résumé
    console.log("\n=== RÉSUMÉ ===");
    const successful = results.filter(r => r.success).length;
    console.log(`${successful}/${CATEGORIES.length} catégories traitées avec succès`);
    
    if (successful < CATEGORIES.length) {
      console.log("⚠️ Certaines catégories n'ont pas pu être traitées, voir les erreurs ci-dessus.");
    } else {
      console.log("✅ Toutes les catégories ont été traitées avec succès!");
    }
    
    // Générer un rapport
    const reportPath = path.join(OUTPUT_DIR, `extraction_report_${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.json`);
    await fs.writeFile(reportPath, JSON.stringify({
      date: new Date().toISOString(),
      results: results,
      summary: {
        total: CATEGORIES.length,
        successful: successful,
        failed: CATEGORIES.length - successful
      }
    }, null, 2));
    
    console.log(`Rapport sauvegardé dans ${reportPath}`);
  } catch (error) {
    console.error("❌ Erreur critique:", error);
    process.exit(1);
  }
}

// Lancer l'exécution
main().catch(console.error);

// Exécution périodique si demandé
if (process.env.RUN_PERIODICALLY === 'true') {
  const interval = parseInt(process.env.INTERVAL_HOURS || '3', 10);
  const intervalMs = interval * 60 * 60 * 1000;
  
  console.log(`\n⏰ Exécution périodique configurée toutes les ${interval} heures`);
  
  setInterval(() => {
    console.log(`\n=== EXÉCUTION PÉRIODIQUE (${new Date().toLocaleString()}) ===`);
    main().catch(console.error);
  }, intervalMs);
}
