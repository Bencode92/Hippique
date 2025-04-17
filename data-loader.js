/**
 * Chargeur de données pour les courses hippiques
 * Ce module gère le chargement des données à partir des fichiers JSON en fonction de la date
 */

// Configuration du chemin des données
const DATA_PATH = 'data/';
const DEFAULT_TYPE_FILTER = ''; // Pas de filtre par défaut pour voir toutes les courses

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
 * Données de secours à utiliser si les fichiers JSON ne sont pas disponibles
 */
const FALLBACK_DATA = {
    "SALON PROVENCE": [
        {
            nom: "PRIX DE LA COTE BLEUE",
            horaire: "11h51",
            numero: "1",
            type: "Plat",
            participants: [
                { n: "1", cheval: "CHARMING CAT", jockey: "HUGO BESNIER", entraineur: "P. COTTIER", proprietaire: "GOUSSERIE RACING", eleveurs: "X. RICHARD", poids: "58 kg", performances: "1p" },
                { n: "2", cheval: "THE BLACK STONE", jockey: "ALEJANDRO GUTIERREZ VAL", entraineur: "MME J. SOUBAGNE", proprietaire: "TAKE FIVE SAS", eleveurs: "TAKE FIVE SAS, MME J. SOUBAGNE", poids: "58 kg", performances: "1p" },
                { n: "3", cheval: "HELLO SPRING", jockey: "DAVID BREUX", entraineur: "T. RICHARD (S)", proprietaire: "H.MONCHAUX/MME K.RICHARD", eleveurs: "H. MONCHAUX", poids: "54,5 kg", performances: "" },
                { n: "4", cheval: "FRAGANCE", jockey: "MME MICKAELLE MICHEL", entraineur: "JPJ. DUBOIS", proprietaire: "MR JEAN-PIERRE-JOSEPH DUBOIS", eleveurs: "JPJ. DUBOIS", poids: "52,5 kg(54 kg)", performances: "6p" },
                { n: "5", cheval: "WHITE NIGHT", jockey: "MME MANON GERMAIN", entraineur: "JPJ. DUBOIS", proprietaire: "MR JEAN-PIERRE-JOSEPH DUBOIS", eleveurs: "JPJ. DUBOIS", poids: "52,5 kg(54 kg)", performances: "8p" },
                { n: "6", cheval: "CLEA CHOPE", jockey: "ANTONIO ORANI", entraineur: "C. ESCUDER", proprietaire: "EC.PUGLIA/EC.J.PIASCO/EC.METAL", eleveurs: "A. CHOPARD", poids: "54 kg", performances: "6p" },
                { n: "7", cheval: "REMENBER CHOPE", jockey: "IORITZ MENDIZABAL", entraineur: "MME M. SCANDELLA-LACAILLE", proprietaire: "R.CAPOZZI/MME M.BLANC", eleveurs: "A. CHOPARD, MME R. KHADDAM, LEMZAR SARL", poids: "54 kg", performances: "3p" },
                { n: "8", cheval: "ILE AUX ROSES", jockey: "MME CORALIE PACAUT", entraineur: "C. ESCUDER", proprietaire: "MR BERNARD GIRAUDON", eleveurs: "GUY PARIENTE HOLDING", poids: "51,5 kg(53 kg)", performances: "" },
                { n: "9", cheval: "PINK ROCHE", jockey: "SYLVAIN RUIS", entraineur: "C. ESCUDER", proprietaire: "MME CRISTEL MARTINA", eleveurs: "SCEA MARMION VAUVILLE", poids: "53 kg", performances: "" }
            ]
        },
        {
            nom: "PRIX D'EYGUIERES",
            horaire: "12h23",
            numero: "2",
            type: "Plat",
            participants: [
                { n: "1", cheval: "FINK PLOYD", jockey: "VALENTIN SEGUY", entraineur: "J. REYNIER (S)", proprietaire: "G.AUGUSTIN-NORMAND", eleveurs: "P. JABOT", poids: "58 kg", performances: "" },
                { n: "2", cheval: "BLACK TIE", jockey: "JEAN-BERNARD EYQUEM", entraineur: "JC. ROUGET (S)", proprietaire: "ECURIE D.LAYANI/GOUSSERIE RACING", eleveurs: "E. PUERARI, ECURIE DU PARC MONCEAU, MME A. GRAVEREAUX, OCEANIC BLOODSTOCK INC", poids: "58 kg", performances: "" },
                { n: "3", cheval: "NELLO", jockey: "HUGO BESNIER", entraineur: "P. COTTIER", proprietaire: "ECURIE DU SUD", eleveurs: "T.DE LA HERONNIERE", poids: "58 kg", performances: "" },
                { n: "4", cheval: "UNFURLED", jockey: "ANTHONY CRASTUS", entraineur: "N. PERRET (S)", proprietaire: "ECURIE THOMAS SIVADIER", eleveurs: "E.A.R.L. ELEVAGE DES LOGES", poids: "58 kg", performances: "" },
                { n: "5", cheval: "SAINT FLORENT", jockey: "MARVIN GRANDIN", entraineur: "J. REYNIER (S)", proprietaire: "LE MARAIS SAS", eleveurs: "HARAS DU LOGIS SAINT GERMAIN", poids: "58 kg", performances: "" },
                { n: "6", cheval: "THE MOON'S ANGEL", jockey: "GUILLAUME MILLET", entraineur: "R. FRADET (S)", proprietaire: "MR MICHEL NIKITAS", eleveurs: "MME R. DWEK, MME C. SIMON, MME T.DE BEAUREGARD, D. SOURDEAU DE BEAUREGARD", poids: "58 kg", performances: "" },
                { n: "7", cheval: "ZELKOVA (IRE)", jockey: "MME CORALIE PACAUT", entraineur: "JC. ROUGET (S)", proprietaire: "AL SHAQAB RACING", eleveurs: "AL SHAQAB RACING", poids: "55 kg(56,5 kg)", performances: "" }
            ]
        },
        {
            nom: "PRIX D'ARLES",
            horaire: "12h55",
            numero: "3",
            type: "Plat",
            participants: [
                { n: "1", cheval: "FIUMICCINO", jockey: "HUGO BESNIER", entraineur: "P. COTTIER", proprietaire: "MR JEAN-PIERRE-JOSEPH DUBOIS", eleveurs: "MME L. LEMIERE DUBOIS", poids: "58 kg", performances: "0p5p2p4p" },
                { n: "2", cheval: "GREEN HEAD", jockey: "MICKAEL FOREST", entraineur: "Y. BONNEFOY (S)", proprietaire: "ECURIE BERTRAND MILLIERE", eleveurs: "ECURIE BERTRAND MILLIERE, C. MILLIERE", poids: "58 kg", performances: "(24)0p" },
                { n: "3", cheval: "GOLDEN BROWN", jockey: "JEAN-BERNARD EYQUEM", entraineur: "JC. ROUGET (S)", proprietaire: "ECURIE VIVALDI", eleveurs: "HARAS DE GRANDCAMP EARL", poids: "58 kg", performances: "3p 2p(24)4p3p2p3p" },
                { n: "4", cheval: "BLACK BOSS", jockey: "GUILLAUME MILLET", entraineur: "R. FRADET (S)", proprietaire: "MR FABRICE FANTAUZZA", eleveurs: "SUC. D.DE LA HERONNIERE", poids: "58 kg", performances: "2p2p" }
            ]
        }
    ],
    "LONGCHAMP": [
        {
            nom: "PRIX DE PARIS",
            horaire: "14h20",
            numero: "1",
            type: "Plat",
            participants: [
                { n: "1", cheval: "GALACTIC STAR", jockey: "CHRISTOPHE SOUMILLON", entraineur: "A. FABRE (S)", proprietaire: "GODOLPHIN SNC", eleveurs: "DARLEY", poids: "58 kg", performances: "1p1p2p" },
                { n: "2", cheval: "SWIFT VICTORY", jockey: "MAXIME GUYON", entraineur: "F. HEAD (S)", proprietaire: "WERTHEIMER & FRERE", eleveurs: "WERTHEIMER ET FRERE", poids: "58 kg", performances: "2p1p3p" },
                { n: "3", cheval: "URBAN LEGEND", jockey: "MICKAEL BARZALONA", entraineur: "A. FABRE (S)", proprietaire: "GODOLPHIN SNC", eleveurs: "DARLEY", poids: "57 kg", performances: "2p3p1p" }
            ]
        }
    ]
};

/**
 * Liste les fichiers JSON disponibles pour une date spécifique
 * @param {string} date - Date au format YYYY-MM-DD
 * @returns {Promise<string[]>} Liste des noms de fichiers
 */
async function listAvailableFiles(date) {
    try {
        console.log("Recherche des fichiers pour la date:", date);
        
        // Liste des fichiers potentiels pour cette date
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
        
        // Vérifier quels fichiers existent réellement
        const availableFiles = [];
        
        for (const file of potentialFiles) {
            try {
                // Tenter de charger le fichier pour vérifier son existence
                console.log(`Vérification du fichier: ${DATA_PATH}${file}`);
                const response = await fetch(`${DATA_PATH}${file}`, { 
                    method: 'HEAD',
                    cache: 'no-store' // Éviter le cache du navigateur
                });
                
                if (response.ok) {
                    console.log(`✅ Fichier trouvé: ${file}`);
                    availableFiles.push(file);
                } else {
                    console.log(`❌ Fichier non trouvé (statut ${response.status}): ${file}`);
                }
            } catch (e) {
                // Si le fichier n'existe pas, continuer silencieusement
                console.log(`❌ Erreur lors de la vérification du fichier: ${file}`, e);
            }
        }
        
        console.log(`Total des fichiers trouvés: ${availableFiles.length}`);
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
        const response = await fetch(`${DATA_PATH}${filename}`, {
            cache: 'no-store' // Éviter le cache du navigateur
        });
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`✅ Fichier ${filename} chargé avec succès`);
        return data;
    } catch (error) {
        console.error(`❌ Erreur lors du chargement du fichier ${filename}:`, error);
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
        
        // Si aucun fichier n'est disponible, utiliser les données de secours
        if (availableFiles.length === 0) {
            console.log("Aucun fichier disponible, utilisation des données de secours");
            return FALLBACK_DATA;
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
                    console.log(`✅ ${filteredCourses.length} courses trouvées pour ${hippodromeName}`);
                } else {
                    console.log(`❌ Aucune course correspondant au filtre pour ${hippodromeName}`);
                }
            } else {
                console.log(`❌ Données invalides ou pas de courses dans le fichier: ${file}`);
            }
        }
        
        // Si aucune donnée n'a été trouvée dans les fichiers, utiliser les données de secours
        if (Object.keys(coursesData).length === 0) {
            console.log("Aucune course trouvée dans les fichiers, utilisation des données de secours");
            return FALLBACK_DATA;
        }
        
        console.log(`Nombre total d'hippodromes avec des courses: ${Object.keys(coursesData).length}`);
        return coursesData;
    } catch (error) {
        console.error("Erreur lors du chargement des données:", error);
        // En cas d'erreur, utiliser les données de secours
        console.log("Utilisation des données de secours suite à une erreur");
        return FALLBACK_DATA;
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
        
        // Si aucune donnée n'est trouvée (ce qui ne devrait plus arriver grâce aux données de secours)
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
            console.log("Appel du callback de succès avec les données chargées");
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
