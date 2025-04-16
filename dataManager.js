/**
 * Gestionnaire de données hippiques
 * Ce module s'occupe du chargement et de la gestion des données pour l'application Analyse Hippique
 */

// Détecter si nous sommes sur GitHub Pages ou en local
const isGitHubPages = window.location.hostname.includes('github.io');
const basePath = isGitHubPages ? '/Hippique' : '';

// Configuration des chemins vers les fichiers de données avec chemins relatifs
const DATA_PATHS = {
  jockeys: `${basePath}/data/jockeys.json`,
  chevaux: `${basePath}/data/chevaux.json`,
  entraineurs: `${basePath}/data/entraineurs.json`, 
  eleveurs: `${basePath}/data/eleveurs.json`,
  proprietaires: `${basePath}/data/proprietaires.json`,
  // Les courses sont organisées par date et hippodrome, donc on les gère séparément
};

// Données de simulation pour le fallback
const DEMO_DATA = {
  jockeys: {
    resultats: [
      { NomPostal: "CRISTIAN DEMURO", Victoires: 63, Place: 188, GainPart: 3851 },
      { NomPostal: "MAXIME GUYON", Victoires: 52, Place: 187, GainPart: 3886 },
      { NomPostal: "DELPHINE SANTIAGO", Victoires: 31, Place: 81, GainPart: 1909 },
      { NomPostal: "AUGUSTIN MADAMET", Victoires: 29, Place: 164, GainPart: 2146 },
      { NomPostal: "STEPHANE PASQUIER", Victoires: 26, Place: 97, GainPart: 3236 }
    ]
  },
  chevaux: {
    resultats: [
      { Nom: "SAINT ETIENNE", Victoires: 4, Place: 9, AllocTot: "109500" },
      { Nom: "AMERICAN FLAG", Victoires: 3, Place: 7, AllocTot: "149125" },
      { Nom: "HYPERCORE", Victoires: 5, Place: 8, AllocTot: "49250" },
      { Nom: "HAVOC", Victoires: 2, Place: 11, AllocTot: "196468" },
      { Nom: "HAVE DANCER", Victoires: 3, Place: 10, AllocTot: "209097" }
    ]
  }
};

/**
 * Classe HippiqueDataManager
 * Chargement et conversion des données JSON
 */
class HippiqueDataManager {
  constructor() {
    this.data = {
      jockeys: null,
      chevaux: null,
      entraineurs: null,
      eleveurs: null,
      proprietaires: null,
      courses: {},
    };
    
    this.ready = false;
    this.onReadyCallbacks = [];
    this.useDemoData = false; // Pour indiquer si on utilise des données de démonstration
  }
  
  /**
   * Initialise le chargement des données
   * @returns {Promise} Promise qui se résout quand toutes les données sont chargées
   */
  async initialize() {
    try {
      console.log("Initialisation du gestionnaire de données...");
      console.log("Chemins des données:", DATA_PATHS);
      
      // Essayons de charger les jockeys d'abord pour tester si les fichiers sont accessibles
      try {
        const jockeysTest = await this.fetchData(DATA_PATHS.jockeys);
        console.log("Test de chargement des jockeys réussi:", jockeysTest.resultats?.length || 0, "jockeys trouvés");
        this.useDemoData = false;
      } catch (error) {
        console.warn("Test de chargement des jockeys échoué, utilisation des données de démonstration:", error);
        this.useDemoData = true;
      }

      // Chargement des données principales
      if (this.useDemoData) {
        console.log("Utilisation des données de démonstration");
        this.data.jockeys = DEMO_DATA.jockeys;
        this.data.chevaux = DEMO_DATA.chevaux;
        
        // Données simulées pour les autres catégories
        this.data.entraineurs = { resultats: [] };
        this.data.eleveurs = { resultats: [] };
        this.data.proprietaires = { resultats: [] };
      } else {
        console.log("Chargement des données depuis les fichiers JSON");
        try {
          const [jockeys, chevaux, entraineurs, eleveurs, proprietaires] = await Promise.all([
            this.fetchData(DATA_PATHS.jockeys),
            this.fetchData(DATA_PATHS.chevaux),
            this.fetchData(DATA_PATHS.entraineurs),
            this.fetchData(DATA_PATHS.eleveurs),
            this.fetchData(DATA_PATHS.proprietaires),
          ]);
          
          this.data.jockeys = jockeys;
          this.data.chevaux = chevaux;
          this.data.entraineurs = entraineurs;
          this.data.eleveurs = eleveurs;
          this.data.proprietaires = proprietaires;
        } catch (error) {
          console.error("Erreur lors du chargement des données, utilisation du mode de démonstration:", error);
          this.useDemoData = true;
          this.data.jockeys = DEMO_DATA.jockeys;
          this.data.chevaux = DEMO_DATA.chevaux;
          this.data.entraineurs = { resultats: [] };
          this.data.eleveurs = { resultats: [] };
          this.data.proprietaires = { resultats: [] };
        }
      }
      
      // Marquer comme prêt et exécuter les callbacks
      this.ready = true;
      console.log("Données chargées avec succès");
      this.onReadyCallbacks.forEach(callback => callback());
      
      return this.data;
    } catch (error) {
      console.error('Erreur lors de l\'initialisation des données:', error);
      // Même en cas d'erreur, marquer comme prêt mais avec des données de démo
      this.useDemoData = true;
      this.data.jockeys = DEMO_DATA.jockeys;
      this.data.chevaux = DEMO_DATA.chevaux;
      this.ready = true;
      this.onReadyCallbacks.forEach(callback => callback());
      throw error;
    }
  }
  
  /**
   * Récupère un fichier JSON
   * @param {string} path Chemin du fichier
   * @returns {Promise<Object>} Les données JSON
   */
  async fetchData(path) {
    try {
      console.log(`Tentative de chargement de ${path}...`);
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      console.log(`Chargement de ${path} réussi:`, data);
      return data;
    } catch (error) {
      console.error(`Erreur lors du chargement de ${path}:`, error);
      throw error;
    }
  }
  
  /**
   * Récupère les données des courses pour un jour et un hippodrome spécifiques
   * @param {string} date Format YYYY-MM-DD
   * @param {string} hippodrome Nom de l'hippodrome
   * @returns {Promise<Object>} Les données des courses
   */
  async getCoursesData(date, hippodrome) {
    if (this.useDemoData) {
      // Simuler des données de course
      return {
        courses: [
          { nom: "PRIX DE LA FONTAINE CARPEAUX", participants: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
          { nom: "PRIX DU LOUVRE", participants: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
          { nom: "PRIX DE LA PROMENADE DES PLANCHES", participants: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
          { nom: "PRIX DU TOTALISATEUR AUTOMATIQUE", participants: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] },
          { nom: "PRIX DE LA BOETIE", participants: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }
        ]
      };
    }
    
    const key = `${date}_${hippodrome.toLowerCase().replace(/\s+/g, '_')}`;
    
    // Si les données sont déjà en cache, les retourner directement
    if (this.data.courses[key]) {
      return this.data.courses[key];
    }
    
    try {
      // Charger les données depuis le fichier
      const coursesData = await this.fetchData(`${basePath}/data/courses/${key}.json`);
      
      // Mettre en cache pour les prochaines requêtes
      this.data.courses[key] = coursesData;
      
      return coursesData;
    } catch (error) {
      console.error(`Erreur lors du chargement des courses pour ${date} à ${hippodrome}:`, error);
      // Retourner des données de démonstration
      const demoData = {
        courses: [
          { nom: "PRIX DE LA FONTAINE CARPEAUX", participants: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
          { nom: "PRIX DU LOUVRE", participants: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
          { nom: "PRIX DE LA PROMENADE DES PLANCHES", participants: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
          { nom: "PRIX DU TOTALISATEUR AUTOMATIQUE", participants: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] },
          { nom: "PRIX DE LA BOETIE", participants: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }
        ]
      };
      this.data.courses[key] = demoData;
      return demoData;
    }
  }
  
  /**
   * Récupère la liste des hippodromes disponibles pour une date donnée
   * @param {string} date Format YYYY-MM-DD
   * @returns {Promise<string[]>} Liste des hippodromes
   */
  async getHippodromesForDate(date) {
    try {
      // Cette fonction nécessiterait un point d'API ou un fichier d'index
      // Pour l'instant, on peut simuler avec des données statiques
      const hippodromes = [
        'ParisLongchamp',
        'Saint-Cloud',
        'Chantilly',
        'Deauville',
        'Lyon Parilly',
        'Strasbourg',
        'Toulouse'
      ];
      
      return hippodromes;
    } catch (error) {
      console.error(`Erreur lors de la récupération des hippodromes pour ${date}:`, error);
      return [];
    }
  }
  
  /**
   * Récupère les données des jockeys triées par victoires
   * @param {number} limit Nombre limite de résultats (optionnel)
   * @returns {Array} Liste des jockeys triés
   */
  getTopJockeys(limit = null) {
    if (!this.ready || !this.data.jockeys) {
      return [];
    }
    
    // Extraire et trier les jockeys par nombre de victoires
    const jockeys = [...this.data.jockeys.resultats]
      .sort((a, b) => b.Victoires - a.Victoires);
    
    // Limiter si nécessaire
    return limit ? jockeys.slice(0, limit) : jockeys;
  }
  
  /**
   * Récupère les données des chevaux triées par gains
   * @param {number} limit Nombre limite de résultats (optionnel)
   * @returns {Array} Liste des chevaux triés
   */
  getTopChevaux(limit = null) {
    if (!this.ready || !this.data.chevaux) {
      return [];
    }
    
    // Extraire et trier les chevaux par gains
    const chevaux = [...this.data.chevaux.resultats]
      .sort((a, b) => {
        // Convertir les gains en nombre pour le tri
        const gainA = typeof a.AllocTot === 'string' ? 
          parseFloat(a.AllocTot.replace(/\s+/g, '').replace(',', '.')) : a.AllocTot;
        const gainB = typeof b.AllocTot === 'string' ? 
          parseFloat(b.AllocTot.replace(/\s+/g, '').replace(',', '.')) : b.AllocTot;
        
        return gainB - gainA;
      });
    
    // Limiter si nécessaire
    return limit ? chevaux.slice(0, limit) : chevaux;
  }
  
  /**
   * Cherche un jockey par son nom
   * @param {string} query Texte de recherche
   * @returns {Array} Jockeys correspondants
   */
  searchJockeys(query) {
    if (!this.ready || !this.data.jockeys) {
      return [];
    }
    
    // Si la requête est vide, retourner tous les jockeys
    if (!query || query.trim() === '') {
      return this.data.jockeys.resultats;
    }
    
    // Nettoyer la requête
    const cleanQuery = query.trim().toLowerCase();
    
    // Filtrer les jockeys
    return this.data.jockeys.resultats.filter(jockey => {
      const nom = jockey.NomPostal ? jockey.NomPostal.toLowerCase() : '';
      return nom.includes(cleanQuery);
    });
  }
  
  /**
   * Cherche un cheval par son nom
   * @param {string} query Texte de recherche
   * @returns {Array} Chevaux correspondants
   */
  searchChevaux(query) {
    if (!this.ready || !this.data.chevaux) {
      return [];
    }
    
    // Si la requête est vide, retourner tous les chevaux
    if (!query || query.trim() === '') {
      return this.data.chevaux.resultats;
    }
    
    // Nettoyer la requête
    const cleanQuery = query.trim().toLowerCase();
    
    // Filtrer les chevaux
    return this.data.chevaux.resultats.filter(cheval => {
      const nom = cheval.nom ? cheval.nom.toLowerCase() : 
                (cheval.Nom ? cheval.Nom.toLowerCase() : '');
      return nom.includes(cleanQuery);
    });
  }
  
  /**
   * Calcule les statistiques globales
   * @returns {Object} Statistiques
   */
  getGlobalStats() {
    if (!this.ready) {
      return null;
    }
    
    // Nombre de courses analysées
    const coursesCount = Object.keys(this.data.courses).length;
    
    // Nombre de chevaux uniques
    const chevauxCount = this.data.chevaux ? this.data.chevaux.resultats.length : 0;
    
    // Nombre de jockeys uniques
    const jockeysCount = this.data.jockeys ? this.data.jockeys.resultats.length : 0;
    
    // Gains moyens (exemple de calcul)
    let gainsMoyens = 0;
    if (this.data.jockeys && this.data.jockeys.resultats.length > 0) {
      const totalGains = this.data.jockeys.resultats.reduce((sum, jockey) => {
        const gain = typeof jockey.GainPart === 'string' ? 
          parseFloat(jockey.GainPart.replace(/\s+/g, '').replace(',', '.')) : jockey.GainPart;
        return sum + (isNaN(gain) ? 0 : gain);
      }, 0);
      gainsMoyens = totalGains / this.data.jockeys.resultats.length;
    }
    
    return {
      coursesCount: this.useDemoData ? 73 : coursesCount,
      chevauxCount: this.useDemoData ? 150 : chevauxCount,
      jockeysCount: this.useDemoData ? 150 : jockeysCount,
      gainsMoyens: this.useDemoData ? 33143 : Math.round(gainsMoyens * 100) / 100
    };
  }
  
  /**
   * S'abonne à l'événement "données prêtes"
   * @param {Function} callback Fonction à exécuter quand les données sont prêtes
   */
  onReady(callback) {
    if (this.ready) {
      callback();
    } else {
      this.onReadyCallbacks.push(callback);
    }
  }
}

// Export d'une instance unique pour toute l'application
const dataManager = new HippiqueDataManager();
export default dataManager;