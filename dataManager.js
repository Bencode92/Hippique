/**
 * Gestionnaire de données hippiques
 * Ce module s'occupe du chargement et de la gestion des données pour l'application Analyse Hippique
 */

// Configuration des chemins vers les fichiers de données
const DATA_PATHS = {
  jockeys: '/data/jockeys.json',
  chevaux: '/data/chevaux.json',
  entraineurs: '/data/entraineurs.json',
  eleveurs: '/data/eleveurs.json',
  proprietaires: '/data/proprietaires.json',
  // Les courses sont organisées par date et hippodrome, donc on les gère séparément
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
  }
  
  /**
   * Initialise le chargement des données
   * @returns {Promise} Promise qui se résout quand toutes les données sont chargées
   */
  async initialize() {
    try {
      // Chargement des données principales
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
      
      // Marquer comme prêt et exécuter les callbacks
      this.ready = true;
      this.onReadyCallbacks.forEach(callback => callback());
      
      return this.data;
    } catch (error) {
      console.error('Erreur lors de l\'initialisation des données:', error);
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
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
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
    const key = `${date}_${hippodrome.toLowerCase().replace(/\s+/g, '_')}`;
    
    // Si les données sont déjà en cache, les retourner directement
    if (this.data.courses[key]) {
      return this.data.courses[key];
    }
    
    try {
      // Charger les données depuis le fichier
      const coursesData = await this.fetchData(`/data/courses/${key}.json`);
      
      // Mettre en cache pour les prochaines requêtes
      this.data.courses[key] = coursesData;
      
      return coursesData;
    } catch (error) {
      console.error(`Erreur lors du chargement des courses pour ${date} à ${hippodrome}:`, error);
      return null;
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
      coursesCount,
      chevauxCount,
      jockeysCount,
      gainsMoyens: Math.round(gainsMoyens * 100) / 100
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