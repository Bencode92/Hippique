/**
 * Chargeur de données pour les courses hippiques
 * Ce module gère le chargement des données à partir des fichiers JSON en fonction de la date
 */

// Configuration du chemin des données
const DATA_PATH = 'data/';
const DEFAULT_TYPE_FILTER = 'Plat'; // Filtre par défaut (courses de plat uniquement)

/**
 * Obtient la date du jour au format YYYY-MM-DD
 * @returns {string} Date formatée
 */
function getTodayDateFormatted() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

/**
 * Extrait le nom de l'hippodrome à partir du nom du fichier
 * @param {string} filename - Nom du fichier JSON
 * @returns {string} Nom de l'hippodrome formaté
 */
function extractHippodromeName(filename) {
    // Par exemple: "2025-04-17_salon_provence.json" => "SALON PROVENCE"
    const match = filename.match(/\d{4}-\d{2}-\d{2}_(.+)\.json/);
    if (match && match[1]) {
        return match[1].replace(/_/g, ' ').toUpperCase();
    }
    return "HIPPODROME INCONNU";
}

/**
 * Liste les fichiers JSON disponibles pour une date spécifique
 * @param {string} date - Date au format YYYY-MM-DD
 * @returns {Promise<string[]>} Liste des noms de fichiers
 */
async function listAvailableFiles(date) {
    try {
        // Liste des fichiers potentiels pour cette date
        // Cette liste inclut tous les hippodromes possibles qui pourraient avoir des courses
        const potentialFiles = [
            `${date}_salon_provence.json`,
            `${date}_longchamp.json`,
            `${date}_parislongchamp.json`,
            `${date}_san_sebastian.json`,
            `${date}_arg_palermo.json`,
            `${date}_valparaiso.json`,
            `${date}_palermo.json`,
            `${date}_auteuil.json`,
            `${date}_chantilly.json`,
            `${date}_saint_cloud.json`,
            `${date}_deauville.json`,
            `${date}_vichy.json`,
            `${date}_toulouse.json`
        ];
        
        console.log("Recherche des fichiers pour la date:", date);
        
        // Vérifier quels fichiers existent réellement
        const availableFiles = [];
        
        for (const file of potentialFiles) {
            try {
                // Tenter de charger le fichier pour vérifier son existence
                const response = await fetch(`${DATA_PATH}${file}`, { method: 'HEAD' });
                if (response.ok) {
                    console.log(`Fichier trouvé: ${file}`);
                    availableFiles.push(file);
                }
            } catch (e) {
                // Si le fichier n'existe pas, continuer silencieusement
                console.log(`Fichier non trouvé: ${file}`);
            }
        }
        
        // Si aucun fichier n'est disponible, utiliser des données de secours
        if (availableFiles.length === 0) {
            console.log("Aucun fichier de données trouvé pour la date:", date);
        }
        
        return availableFiles;
    } catch (error) {
        console.error("Erreur lors de la recherche des fichiers:", error);
        return [];
    }
}

/**
 * Charge les données d'un fichier JSON
 * @param {string} filename - Nom du fichier à charger
 * @returns {Promise<Object>} Données chargées
 */
async function loadJsonFile(filename) {
    try {
        console.log(`Chargement du fichier: ${DATA_PATH}${filename}`);
        const response = await fetch(`${DATA_PATH}${filename}`);
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Erreur lors du chargement du fichier ${filename}:`, error);
        return null;
    }
}

/**
 * Charge les données de courses pour une date spécifique
 * @param {string} date - Date au format YYYY-MM-DD
 * @param {string} typeFilter - Filtre optionnel par type de course (ex: 'Plat')
 * @returns {Promise<Object>} Données des courses par hippodrome
 */
async function loadRacesData(date, typeFilter = DEFAULT_TYPE_FILTER) {
    // Si aucune date n'est fournie, utiliser la date du jour
    const targetDate = date || getTodayDateFormatted();
    let coursesData = {};
    
    try {
        console.log(`Chargement des données pour la date: ${targetDate}, filtre: ${typeFilter || 'aucun'}`);
        
        // Récupérer la liste des fichiers disponibles pour cette date
        const availableFiles = await listAvailableFiles(targetDate);
        
        // Si aucun fichier n'est disponible, retourner un objet vide
        if (availableFiles.length === 0) {
            console.log("Aucun fichier disponible pour cette date.");
            return {};
        }
        
        // Charger chaque fichier et extraire les données
        for (const file of availableFiles) {
            const hippodromeName = extractHippodromeName(file);
            
            // Charger les données
            const data = await loadJsonFile(file);
            
            if (data && data.courses && Array.isArray(data.courses)) {
                // Appliquer le filtre par type si spécifié
                let filteredCourses = data.courses;
                if (typeFilter) {
                    filteredCourses = data.courses.filter(course => 
                        course.type && course.type.toLowerCase() === typeFilter.toLowerCase()
                    );
                }
                
                // Si des courses correspondent au filtre, les ajouter au résultat
                if (filteredCourses.length > 0) {
                    coursesData[hippodromeName] = filteredCourses;
                    console.log(`${filteredCourses.length} courses trouvées pour ${hippodromeName}`);
                } else {
                    console.log(`Aucune course correspondant au filtre pour ${hippodromeName}`);
                }
            } else {
                console.log(`Données invalides ou pas de courses dans le fichier: ${file}`);
            }
        }
        
        console.log(`Nombre total d'hippodromes avec des courses: ${Object.keys(coursesData).length}`);
        return coursesData;
    } catch (error) {
        console.error("Erreur lors du chargement des données:", error);
        return {};
    }
}

/**
 * Formate une date pour l'affichage
 * @param {string} dateStr - Date au format YYYY-MM-DD
 * @returns {string} Date formatée pour l'affichage (DD/MM/YYYY)
 */
function formattedDate(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

/**
 * Met à jour l'affichage de la date dans l'interface
 * @param {string} dateStr - Date au format YYYY-MM-DD
 */
function updateDisplayDate(dateStr) {
    const currentDateSpan = document.getElementById('current-date');
    if (currentDateSpan) {
        const displayDate = dateStr;
        const dateParts = displayDate.split('-');
        const formattedDateStr = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        
        // Vérifier si c'est aujourd'hui ou demain
        const today = getTodayDateFormatted();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDate = tomorrow.toISOString().split('T')[0];
        
        if (displayDate === today) {
            currentDateSpan.textContent = `Aujourd'hui (${formattedDateStr})`;
        } else if (displayDate === tomorrowDate) {
            currentDateSpan.textContent = `Demain (${formattedDateStr})`;
        } else {
            currentDateSpan.textContent = formattedDateStr;
        }
    }
    
    // Mettre à jour la date de dernière mise à jour
    const lastUpdateEl = document.getElementById('last-update');
    if (lastUpdateEl) {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        lastUpdateEl.textContent = `${day}/${month}/${year}`;
    }
}

/**
 * Charge les courses pour la date du jour ou une date spécifiée
 * et met à jour l'interface utilisateur
 * @param {string} date - Date au format YYYY-MM-DD (optionnel)
 * @param {Function} successCallback - Fonction appelée avec les données chargées
 * @param {Function} errorCallback - Fonction appelée en cas d'erreur
 */
async function loadAndDisplayRaces(date, successCallback, errorCallback) {
    try {
        // Afficher un indicateur de chargement
        const resultsContainer = document.getElementById('results-container');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <p>Chargement des courses...</p>
                </div>
            `;
        }
        
        // Utiliser la date fournie ou celle du jour
        const targetDate = date || getTodayDateFormatted();
        console.log(`Chargement des courses pour la date: ${targetDate}`);
        
        // Charger les données - Tous les types de courses (pas de filtre)
        const data = await loadRacesData(targetDate, '');
        
        // Si aucune donnée n'est trouvée
        if (Object.keys(data).length === 0) {
            if (errorCallback) {
                errorCallback("Aucune course trouvée pour cette date");
            } else {
                if (resultsContainer) {
                    resultsContainer.innerHTML = `
                        <div class="no-results">
                            <i class="fas fa-search"></i>
                            <h3>Aucune course trouvée pour le ${formattedDate(targetDate)}</h3>
                            <p>Essayez une autre date ou consultez les courses récentes.</p>
                        </div>
                    `;
                }
            }
            return;
        }
        
        // Si des données sont trouvées, appeler le callback de succès
        if (successCallback) {
            successCallback(data);
        }
        
        // Mettre à jour la date d'affichage
        updateDisplayDate(targetDate);
    } catch (error) {
        console.error("Erreur lors du chargement et de l'affichage des courses:", error);
        if (errorCallback) {
            errorCallback(error.message);
        }
    }
}

// Exporter les fonctions pour utilisation externe
window.hippique = {
    getTodayDateFormatted,
    loadRacesData,
    loadAndDisplayRaces,
    DEFAULT_TYPE_FILTER,
    formattedDate
};
