/**
 * ponderated-data-loader.js
 * Module optimisé pour charger les données de classement pondéré
 * Ce fichier remplace certaines fonctionnalités du code intégré dans index.html
 * en utilisant directement les fichiers _ponderated_latest.json
 */

// Module pour le calcul du score prédictif avec chargement des classements pondérés
const scorePredictorImproved = {
    // Données de classement mises en cache
    data: {
        chevaux: null,
        jockeys: null,
        entraineurs: null,
        eleveurs: null,
        proprietaires: null
    },
    
    // Charger les données d'une catégorie
    async loadCategoryData(category) {
        if (this.data[category]) {
            return this.data[category];
        }
        
        try {
            // Déterminer si nous sommes sur GitHub Pages ou en local
            const isGitHubPages = window.location.hostname.includes('github.io');
            const basePath = isGitHubPages ? '/Hippique' : '';
            
            console.log(`Tentative de chargement des données pondérées pour ${category}...`);
            
            // OPTIMISATION: Utiliser directement les fichiers pondérés latest
            const response = await fetch(`${basePath}/data/${category}_ponderated_latest.json`);
            
            if (!response.ok) {
                console.warn(`Fichier pondéré non trouvé pour ${category}, tentative avec fichier standard...`);
                // Fallback sur les anciens fichiers si le pondéré n'existe pas
                const oldResponse = await fetch(`${basePath}/data/${category}.json`);
                if (!oldResponse.ok) {
                    throw new Error(`Erreur HTTP ${oldResponse.status}`);
                }
                
                const oldData = await oldResponse.json();
                if (oldData && oldData.resultats) {
                    console.log(`Fallback: Utilisation des données standard pour ${category}`);
                    this.data[category] = oldData.resultats;
                    return oldData.resultats;
                }
            } else {
                // Utiliser directement les données pondérées
                const ponderedData = await response.json();
                if (ponderedData && ponderedData.resultats) {
                    console.log(`✅ Utilisation des données pondérées pour ${category}`);
                    this.data[category] = ponderedData.resultats;
                    return ponderedData.resultats;
                }
            }
            
            return [];
        } catch (error) {
            console.error(`Erreur lors du chargement des données ${category}:`, error);
            return [];
        }
    },
    
    // Charger toutes les données nécessaires
    async loadAllData() {
        const promises = [
            this.loadCategoryData('chevaux'),
            this.loadCategoryData('jockeys'),
            this.loadCategoryData('entraineurs'),
            this.loadCategoryData('eleveurs'),
            this.loadCategoryData('proprietaires')
        ];
        
        return Promise.all(promises);
    },
    
    // Fonction pour normaliser et nettoyer un nom
    normaliserNom(nom) {
        if (!nom) return "";
        
        // Convertir en majuscules et supprimer les espaces superflus
        let nomNormalise = nom.toUpperCase().trim();
        
        // Supprimer les suffixes techniques pour les chevaux
        nomNormalise = nomNormalise.replace(/\s+[FM]\.P\.S\..*$/i, "")
                                .replace(/\s+GB\s+F\.P\.S\..*$/i, "")
                                .replace(/\s+\d+A\..*$/i, "")
                                .replace(/\s+\(SUP\)$/i, "");
        
        // Standardiser les préfixes
        nomNormalise = nomNormalise.replace(/^M\.\s*/i, "MR ")
                                .replace(/^MME\.\s*/i, "MME ")
                                .replace(/^MLLE\.\s*/i, "MLLE ");
        
        // Standardiser les abréviations connues
        const abreviations = {
            "RY": "ROGER-YVES",
            "JC": "JEAN-CLAUDE",
            "MT": "MARIE-THERESE",
            "P DE": "PRUDENCE DE",
            "C.": "CHLOE"
        };
        
        // Remplacer les abréviations connues
        for (const [abrev, complet] of Object.entries(abreviations)) {
            // Recherche avec limites de mots pour éviter les faux positifs
            const regex = new RegExp(`\\b${abrev}\\b`, 'g');
            nomNormalise = nomNormalise.replace(regex, complet);
        }
        
        return nomNormalise;
    },
    
    // OPTIMISATION: Trouver directement un rang par nom
    trouverParticipantParNom(data, nom) {
        if (!nom || !data || !Array.isArray(data)) return null;
        
        const nomNormalise = this.normaliserNom(nom);
        
        // Recherche exacte d'abord
        const match = data.find(item => {
            const itemNom = item.Nom || item.NomPostal || "";
            return this.normaliserNom(itemNom) === nomNormalise;
        });
        
        if (match) return match;
        
        // Recherche partielle ensuite
        return data.find(item => {
            const itemNom = item.Nom || item.NomPostal || "";
            const itemNomNormalise = this.normaliserNom(itemNom);
            return itemNomNormalise.includes(nomNormalise) || nomNormalise.includes(itemNomNormalise);
        });
    },
    
    // Fonction spéciale pour les éleveurs et propriétaires avec initiales
    trouverPersonneParInitiale(donneesClassement, nomAvecInitiale, categorie) {
        if (!nomAvecInitiale || !donneesClassement || !donneesClassement.length) {
            return { score: 50, rang: null };
        }
        
        // Ne s'applique qu'aux éleveurs et propriétaires
        if (categorie !== 'eleveurs' && categorie !== 'proprietaires') {
            return this.trouverMeilleurScore(donneesClassement, nomAvecInitiale);
        }
        
        // Normaliser le nom avec l'initiale
        const nomNormalise = this.normaliserNom(nomAvecInitiale);
        
        // Extraire l'initiale et le nom de famille
        const match = nomNormalise.match(/^([A-Z])(?:\.\s*|\s+)([A-Z\s]+)$/i);
        
        if (match) {
            const initiale = match[1].toUpperCase();
            const nomFamille = match[2].trim().toUpperCase();
            
            // Chercher tous les noms qui correspondent au nom de famille et dont le prénom commence par l'initiale
            const correspondances = donneesClassement.filter(item => {
                const nomComplet = this.normaliserNom(item.Nom || item.NomPostal || "");
                
                // Décomposer le nom complet en prénom + nom de famille
                const parties = nomComplet.split(/\s+/);
                
                if (parties.length < 2) return false;
                
                // Le premier élément est généralement le prénom
                const prenom = parties[0];
                // Le reste forme le nom de famille
                const nom = parties.slice(1).join(" ");
                
                // Vérifier si le prénom commence par l'initiale et si le nom de famille correspond
                return prenom.startsWith(initiale) && nom.includes(nomFamille);
            });
            
            // Si on a trouvé exactement une correspondance, c'est probablement la bonne
            if (correspondances.length === 1) {
                return {
                    score: 0, // Plus utilisé, maintenant on utilise le rang
                    rang: correspondances[0].Rang,
                    nomTrouve: correspondances[0].Nom || correspondances[0].NomPostal
                };
            }
            
            // Si on a plusieurs correspondances, prendre celle avec le meilleur rang
            if (correspondances.length > 1) {
                const meilleure = correspondances.reduce((best, current) => {
                    if (!best) return current;
                    
                    const rangCurrent = parseInt(current.Rang) || 999;
                    const rangBest = parseInt(best.Rang) || 999;
                    
                    return rangCurrent < rangBest ? current : best;
                }, null);
                
                if (meilleure) {
                    return {
                        score: 0, // Plus utilisé, maintenant on utilise le rang
                        rang: meilleure.Rang,
                        nomTrouve: meilleure.Nom || meilleure.NomPostal
                    };
                }
            }
        }
        
        // Si on n'a pas trouvé avec l'approche des initiales, essayer avec l'approche standard
        return this.trouverMeilleurScore(donneesClassement, nomAvecInitiale);
    },
    
    // Trouver le meilleur score pour un nom dans les données de classement
    trouverMeilleurScore(donneesClassement, nom) {
        if (!nom || !donneesClassement || !donneesClassement.length) {
            return { score: 0, rang: null };
        }
        
        const nomNormalise = this.normaliserNom(nom);
        
        // Tableau pour stocker les correspondances possibles avec leurs scores de similarité
        const correspondances = [];
        
        donneesClassement.forEach(item => {
            const nomReference = this.normaliserNom(item.Nom || item.NomPostal || "");
            
            // Calculer différents types de correspondance
            let similarite = 0;
            
            // 1. Correspondance exacte
            if (nomReference === nomNormalise) {
                similarite = 100;
            } 
            // 2. L'un contient l'autre intégralement
            else if (nomReference.includes(nomNormalise) || nomNormalise.includes(nomReference)) {
                similarite = 90;
            } 
            // 3. Correspondance partielle de mots
            else {
                const motsRef = nomReference.split(/\s+/);
                const motsNom = nomNormalise.split(/\s+/);
                
                // Compter les mots en commun
                const motsCommuns = motsRef.filter(mot => motsNom.includes(mot)).length;
                
                if (motsCommuns > 0) {
                    // Score basé sur le pourcentage de mots en commun
                    similarite = Math.min(80, (motsCommuns / Math.max(motsRef.length, motsNom.length)) * 100);
                }
            }
            
            if (similarite > 50) { // Seuil minimum de similarité
                correspondances.push({
                    item: item,
                    similarite: similarite
                });
            }
        });
        
        // Trier par similarité décroissante
        correspondances.sort((a, b) => b.similarite - a.similarite);
        
        // Si on a trouvé des correspondances, retourner la meilleure
        if (correspondances.length > 0) {
            return {
                score: 0, // Plus utilisé, maintenant on utilise le rang
                rang: correspondances[0].item.Rang,
                similarite: correspondances[0].similarite
            };
        }
        
        return { score: 0, rang: null }; // Valeur par défaut si non trouvé
    },
    
    // Trouver le rang d'un acteur dans son classement pondéré
    trouverRangDansClassement(donneesClassement, nom, categorie) {
        if (!nom || !donneesClassement || !donneesClassement.length) {
            return null;
        }
        
        // Pour les éleveurs et propriétaires qui peuvent être multiples
        if (categorie === 'eleveurs' || categorie === 'proprietaires') {
            // Si c'est une chaîne, la diviser sur les virgules et autres séparateurs
            const noms = typeof nom === 'string' 
                ? nom.split(/\s*[,&\/]\s*/) 
                : [nom];
            
            if (noms.length === 0 || !noms[0]) {
                return null;
            }
            
            // Chercher le meilleur rang parmi tous les noms
            let meilleurRang = null;
            
            for (const nomIndividuel of noms) {
                const resultat = this.trouverPersonneParInitiale(donneesClassement, nomIndividuel, categorie);
                if (resultat.rang !== null) {
                    const rang = parseInt(resultat.rang);
                    if (meilleurRang === null || rang < meilleurRang) {
                        meilleurRang = rang;
                    }
                }
            }
            
            return meilleurRang;
        }
        
        // Pour les autres catégories
        const nomNormalise = this.normaliserNom(nom);
        
        // OPTIMISATION: Rechercher une correspondance exacte directement
        const participant = this.trouverParticipantParNom(donneesClassement, nom);
        if (participant && participant.Rang) {
            return parseInt(participant.Rang);
        }
        
        // Si pas de correspondance exacte, rechercher une correspondance approximative
        const resultat = this.trouverMeilleurScore(donneesClassement, nom);
        return resultat.rang ? parseInt(resultat.rang) : null;
    },
    
    // Fonction utilitaire pour obtenir la valeur d'une propriété avec plusieurs noms possibles
    getPropertyValue(obj, propertyNames) {
        for (const name of propertyNames) {
            if (obj && obj[name] !== undefined) {
                return obj[name];
            }
        }
        return null;
    },
    
    // Calculer le score prédictif pour un participant
    calculerScoreParticipant(participant) {
        // Récupérer les rangs pour chaque acteur
        const rangCheval = this.trouverRangDansClassement(this.data.chevaux, participant.cheval, 'chevaux');
        const rangJockey = this.trouverRangDansClassement(this.data.jockeys, participant.jockey, 'jockeys');
        const rangEntraineur = this.trouverRangDansClassement(this.data.entraineurs, participant.entraineur, 'entraineurs');
        
        // Pour les éleveurs et propriétaires, qui peuvent être multiples
        const proprioValue = this.getPropertyValue(participant, [
            "proprietaire", "propriétaire", 
            "proprio", "owner", "owner_name"
        ]);
        
        const eleveurValue = this.getPropertyValue(participant, [
            "eleveurs", "éleveurs", 
            "eleveur", "éleveur", 
            "breeder", "breeder_name"
        ]);
        
        const rangEleveur = this.trouverRangDansClassement(this.data.eleveurs, eleveurValue, 'eleveurs');
        const rangProprio = this.trouverRangDansClassement(this.data.proprietaires, proprioValue, 'proprietaires');
        
        // Inverser les rangs pour obtenir un score (plus le rang est bas, meilleur est le score)
        // Nous limitons à un maximum de 100 pour éviter des valeurs extrêmes
        const maxRang = 100;
        const scoreCheval = rangCheval ? Math.max(0, maxRang - rangCheval) : 30; // valeur par défaut si non trouvé
        const scoreJockey = rangJockey ? Math.max(0, maxRang - rangJockey) : 30;
        const scoreEntraineur = rangEntraineur ? Math.max(0, maxRang - rangEntraineur) : 30;
        const scoreEleveur = rangEleveur ? Math.max(0, maxRang - rangEleveur) : 30;
        const scoreProprio = rangProprio ? Math.max(0, maxRang - rangProprio) : 30;
        
        // Appliquer la formule de pondération, mais avec les rangs inversés
        // Plus le rang est bas, plus le score inversé est élevé
        const scorePredictif = (
            0.55 * scoreCheval +
            0.15 * scoreJockey +
            0.12 * scoreEntraineur +
            0.10 * scoreEleveur +
            0.08 * scoreProprio
        );
        
        return {
            score: scorePredictif.toFixed(1),
            details: {
                cheval: {
                    rang: rangCheval || "NC",
                    score: scoreCheval.toFixed(1)
                },
                jockey: {
                    rang: rangJockey || "NC",
                    score: scoreJockey.toFixed(1)
                },
                entraineur: {
                    rang: rangEntraineur || "NC",
                    score: scoreEntraineur.toFixed(1)
                },
                eleveur: {
                    rang: rangEleveur || "NC",
                    score: scoreEleveur.toFixed(1)
                },
                proprietaire: {
                    rang: rangProprio || "NC",
                    score: scoreProprio.toFixed(1)
                }
            }
        };
    },
    
    // Calculer les scores prédictifs pour tous les participants d'une course
    async calculerScoresCourse(course) {
        // S'assurer que toutes les données sont chargées
        await this.loadAllData();
        
        if (!course || !course.participants || !Array.isArray(course.participants)) {
            return [];
        }
        
        // Calculer le score pour chaque participant
        const resultats = course.participants.map(participant => {
            const scorePredictif = this.calculerScoreParticipant(participant);
            return {
                participant: participant,
                scorePredictif: scorePredictif
            };
        });
        
        // Trier par score décroissant
        const resultatsTries = resultats.sort((a, b) => 
            parseFloat(b.scorePredictif.score) - parseFloat(a.scorePredictif.score)
        );
        
        // Attribuer les rangs en tenant compte des ex-aequo
        let rang = 1;
        let scorePrec = null;
        
        resultatsTries.forEach((resultat, index) => {
            const score = parseFloat(resultat.scorePredictif.score);
            if (index > 0 && score !== scorePrec) {
                rang = index + 1; // Nouveau rang si le score est différent
            }
            resultat.rang = rang;
            scorePrec = score;
        });
        
        return resultatsTries;
    }
};

// Fonction pour charger et afficher les top performers avec les données pondérées
async function loadTopPerformersWithPonderated() {
    // Précharger toutes les données de classement
    await scorePredictorImproved.loadAllData();
    
    // Liste des catégories à afficher
    const categories = [
        {id: 'jockeys', icon: 'fa-user', container: 'top-jockeys'},
        {id: 'chevaux', icon: 'fa-horse', container: 'top-chevaux'},
        {id: 'entraineurs', icon: 'fa-users', container: 'top-entraineurs'},
        {id: 'eleveurs', icon: 'fa-seedling', container: 'top-eleveurs'},
        {id: 'proprietaires', icon: 'fa-user-tie', container: 'top-proprietaires'}
    ];
    
    // Traiter chaque catégorie
    categories.forEach(category => {
        // Vérifier si le container existe (pour les sections présentes sur la page)
        const container = document.getElementById(category.container);
        if (!container) return;
        
        // Récupérer les données de cette catégorie (déjà triées par le rang mixte)
        const data = scorePredictorImproved.data[category.id] || [];
        
        // Si aucune donnée, afficher un message
        if (!data.length) {
            container.innerHTML = `
                <div style="text-align: center; padding: 1rem;">
                    <p>Aucune donnée disponible pour cette catégorie</p>
                </div>
            `;
            return;
        }
        
        // Prendre les 4 premiers éléments
        const topItems = data.slice(0, 4);
        
        // Générer le HTML pour cette catégorie
        let html = '';
        topItems.forEach(item => {
            // Récupérer le nom selon la catégorie
            const name = category.id === 'chevaux' ? item.Nom : item.NomPostal;
            const rang = item.Rang; // Utiliser le rang directement
            
            // Calculer la largeur de la barre de progression basée sur le rang
            // (95% pour #1, 85% pour #2, etc.)
            const progressWidth = Math.max(40, 100 - ((rang - 1) * 15));
            
            // Déterminer la classe pour la médaille (top 3)
            const rangClass = rang <= 3 ? `rang-${rang}` : '';
            
            html += `
                <div class="jockey-item">
                    <div class="jockey-img">
                        <i class="fas ${category.icon}"></i>
                    </div>
                    <div class="jockey-info">
                        <h3>${name || 'Inconnu'}</h3>
                        <div class="progress-bar">
                            <div class="progress" style="width: ${progressWidth}%"></div>
                        </div>
                        <span class="score">Rang <span class="rang-badge ${rangClass}">#${rang}</span></span>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    });
}

// Initialiser automatiquement lorsque la page est chargée
document.addEventListener('DOMContentLoaded', function() {
    // Remplacer l'ancien scorePredictor par la version améliorée
    if (typeof window.scorePredictor !== 'undefined') {
        console.log("📊 Remplaçant l'ancien scorePredictor par la version optimisée");
        window.scorePredictor = scorePredictorImproved;
    }
    
    // Remplacer la fonction loadTopPerformers par la version améliorée si elle existe
    if (typeof window.loadTopPerformers !== 'undefined') {
        console.log("📊 Remplaçant l'ancienne fonction loadTopPerformers par la version optimisée");
        window.loadTopPerformers = loadTopPerformersWithPonderated;
    }
    
    // Les encarts « Top … » coûtent 13 Mo de classements pondérés (chevaux 1,6 Mo,
    // propriétaires 2,7, éleveurs 1,9…). Les charger au DOMContentLoaded faisait
    // patienter une minute avant d'afficher une course sur le réseau d'un
    // hippodrome — alors que la carte n'en a plus besoin (data/jour/<date>.json).
    // On attend donc que ces encarts arrivent réellement à l'écran.
    const topJockeysContainer = document.getElementById('top-jockeys');
    if (topJockeysContainer) {
        if (!('IntersectionObserver' in window)) {
            loadTopPerformersWithPonderated();
        } else {
            const io = new IntersectionObserver(function (entrees) {
                if (entrees.some(function (e) { return e.isIntersecting; })) {
                    io.disconnect();
                    console.log("📊 Encarts Top visibles — chargement des données pondérées");
                    loadTopPerformersWithPonderated();
                }
            }, { threshold: 0.1 });
            io.observe(topJockeysContainer);
        }
    }
});

// Exporter les objets pour une utilisation dans d'autres modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        scorePredictorImproved,
        loadTopPerformersWithPonderated
    };
}
