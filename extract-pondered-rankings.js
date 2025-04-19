// extract-pondered-rankings.js
const fs = require('fs').promises;
const path = require('path');
const https = require('https');

// Configuration
const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/bencode92/Hippique/main/';
const OUTPUT_DIR = './data';
const CATEGORIES = [
  { id: 'jockeys', file: 'data/jockeys.json' },
  { id: 'chevaux', file: 'data/chevaux.json' },
  { id: 'entraineurs', file: 'data/entraineurs.json' },
  { id: 'eleveurs', file: 'data/eleveurs.json' },
  { id: 'proprietaires', file: 'data/proprietaires.json' }
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
  
  // Cloner les données pour ne pas modifier les originales
  const dataCopy = JSON.parse(JSON.stringify(data));
  
  // Fonctions d'accès aux différentes métriques selon la catégorie
  const victoryGetter = item => {
    return category === 'chevaux' ? 
      parseInt(item.NbVictoires || 0) : 
      parseInt(item.Victoires || 0);
  };
  
  const victoryRateGetter = item => parseFloat(item.TauxVictoire || 0);
  const placeRateGetter = item => parseFloat(item.TauxPlace || 0);
  
  // Ajout du getter pour le gain moyen
  const gainMoyenGetter = item => {
    if (category !== 'chevaux') return 0;
    
    if (!item.GainMoyen) return 0;
    // Gérer à la fois les valeurs numériques et les chaînes
    if (typeof item.GainMoyen === 'number') {
      return item.GainMoyen;
    }
    return parseFloat(item.GainMoyen.toString().replace(/\s+/g, '').replace(',', '.')) || 0;
  };
  
  // Calcul des rangs pour chaque métrique avec gestion des égalités DENSE
  const victoryRanks = rankWithTiesDense(dataCopy, victoryGetter, category);
  const victoryRateRanks = rankWithTiesDense(dataCopy, victoryRateGetter, category);
  const placeRateRanks = rankWithTiesDense(dataCopy, placeRateGetter, category);
  
  // Ajouter le calcul des rangs pour les gains moyens (seulement pour les chevaux)
  const gainMoyenRanks = category === 'chevaux' ? 
    rankWithTiesDense(dataCopy, gainMoyenGetter, category) : new Map();
  
  // Calculer les statistiques min/max pour les gains moyens
  let minGain = Number.MAX_VALUE;
  let maxGain = 0;
  
  if (category === 'chevaux') {
    dataCopy.forEach(item => {
      const gainValue = gainMoyenGetter(item);
      if (gainValue > 0) {
        minGain = Math.min(minGain, gainValue);
        maxGain = Math.max(maxGain, gainValue);
      }
    });
    
    // Éviter les divisions par zéro
    if (minGain === maxGain || minGain === Number.MAX_VALUE) {
      minGain = 0;
      maxGain = maxGain > 0 ? maxGain : 100000;
    }
  }
  
  // Calcul du score pondéré pour chaque participant
  dataCopy.forEach(item => {
    const key = category === 'chevaux' ? item.Nom : item.NomPostal;
    
    if (!key) {
      item.ScoreMixte = 999; // Valeur par défaut pour les items mal formés
      return;
    }
    
    // NOUVELLE LOGIQUE POUR LES CHEVAUX
    if (category === 'chevaux') {
      // Récupérer les rangs avec égalités DENSES
      const rangVictoires = victoryRanks.get(key) || 999;
      const rangTauxVictoire = victoryRateRanks.get(key) || 999;
      const rangTauxPlace = placeRateRanks.get(key) || 999;
      const rangGainMoyen = gainMoyenRanks.get(key) || 999;
      
      // Récupérer les données brutes pour les calculs
      const nbCourses = parseInt(item.NbCourses || 0);
      const nbVictoires = parseInt(item.NbVictoires || 0);
      const nbPlaces = parseInt(item.NbPlace || 0);
      const tauxVictoire = parseFloat(item.TauxVictoire || 0) / 100;
      
      // Calculer la régularité (victoires + places)/courses
      const regularite = nbCourses > 0 ? (nbVictoires + nbPlaces) / nbCourses : 0;
      
      // Formule standardisée pour tous les chevaux, sans bonus spécial pour 100%
      const scoreFinal = (
        0.1 * (1 - (rangGainMoyen / 1000)) +    // Gain moyen (10%)
        0.4 * regularite +                       // Régularité (40%)
        0.3 * tauxVictoire +                     // Taux de victoire (30%)
        0.2 * (1 - (rangVictoires / 1000))       // Rangs victoires inversé (20%)
      );
      
      // Inverser le score pour que 0 soit le meilleur
      item.RawScore = scoreFinal;
      item.ScoreMixte = (1000 * (1 - scoreFinal)).toFixed(2);
    } else {
      // Pour les autres catégories, logique inchangée
      // Récupérer les rangs avec égalités DENSES
      const rangVictoires = victoryRanks.get(key) || 999;
      const rangTauxVictoire = victoryRateRanks.get(key) || 999;
      const rangTauxPlace = placeRateRanks.get(key) || 999;
      
      // Pondération adaptative
      let poidsV = 0.5;  // Poids par défaut pour les victoires
      let poidsTV = 0.3; // Poids par défaut pour le taux de victoire
      let poidsTP = 0.2; // Poids par défaut pour le taux de place
      
      // Calcul du score pondéré avec rangs DENSES
      item.ScoreMixte = (
        poidsV * rangVictoires +
        poidsTV * rangTauxVictoire +
        poidsTP * rangTauxPlace
      ).toFixed(2);
    }
  });
  
  // Tri final par score
  let sortedData;
  
  if (category === 'chevaux') {
    // Pour les chevaux, trier par score brut décroissant
    sortedData = dataCopy.sort((a, b) => {
      const diff = (b.RawScore || 0) - (a.RawScore || 0);
      if (diff !== 0) return diff;
      
      // Départage par nom en cas d'égalité
      return a.Nom.localeCompare(b.Nom);
    });
  } else {
    // Pour les autres catégories, trier par score mixte croissant
    sortedData = dataCopy.sort((a, b) => {
      const diff = parseFloat(a.ScoreMixte || 999) - parseFloat(b.ScoreMixte || 999);
      if (diff !== 0) return diff;
      
      // Départage par nom en cas d'égalité
      const nameA = category === 'chevaux' ? a.Nom : a.NomPostal;
      const nameB = category === 'chevaux' ? b.Nom : b.NomPostal;
      return nameA.localeCompare(nameB);
    });
  }
  
  // Assigner les rangs finaux
  sortedData.forEach((item, index) => {
    item.Rang = index + 1;
  });
  
  return sortedData;
}

// Prétraiter les données brutes avant calcul du classement pondéré
function preprocessData(data, category) {
  if (!data.resultats || !Array.isArray(data.resultats)) {
    console.error(`Données invalides pour ${category}: pas de resultats ou pas un tableau`);
    return [];
  }
  
  // Pour les chevaux, structure différente
  if (category === 'chevaux') {
    return data.resultats.map(item => {
      const nbCourses = parseInt(item.NbCourses || 0);
      const nbVictoires = parseInt(item.NbVictoires || 0);
      const nbPlace = parseInt(item.NbPlace || 0);
      
      // Calculer les taux
      const tauxVictoire = nbCourses > 0 ? ((nbVictoires / nbCourses) * 100).toFixed(1) : "0.0";
      const tauxPlace = nbCourses > 0 ? ((nbPlace / nbCourses) * 100).toFixed(1) : "0.0";
      
      // Traitement du gain moyen pour qu'il soit disponible
      let gainMoyen;
      if (typeof item.GainMoyen === 'number') {
        gainMoyen = item.GainMoyen;
      } else if (item.GainMoyen) {
        gainMoyen = item.GainMoyen;
      } else if (typeof item.Allocation === 'number') {
        gainMoyen = item.Allocation;
      } else if (item.Allocation) {
        gainMoyen = item.Allocation;
      } else {
        gainMoyen = 0;
      }
      
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
      
      return {
        ...item,
        Partants: partants,
        Victoires: victoires,
        Place: place,
        TauxVictoire: tauxVictoire,
        TauxPlace: tauxPlace
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
        version: "2.0" // Mise à jour pour refléter l'ajout du gain moyen
      },
      resultats: rankedData
    };
    
    // Générer les noms de fichiers
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const timestampedFile = path.join(OUTPUT_DIR, `${category.id}_ponderated_${timestamp}.json`);
    const latestFile = path.join(OUTPUT_DIR, `${category.id}_ponderated_latest.json`);
    
    // Écrire les fichiers
    await fs.writeFile(timestampedFile, JSON.stringify(result, null, 2));
    await fs.writeFile(latestFile, JSON.stringify(result, null, 2));
    
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
  console.log("Version: 2.0 - Intégration du gain moyen pour les chevaux");
  
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
      version: "2.0",
      changes: "Ajout du gain moyen dans le calcul de score pour les chevaux",
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