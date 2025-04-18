// Module amélioré pour le chargement des classements pondérés
const rankingLoader = {
    // Cache des données de classement
    data: {
        chevaux: null,
        jockeys: null,
        entraineurs: null,
        eleveurs: null,
        proprietaires: null
    },
    
    // Charger les données d'une catégorie avec priorité aux classements pondérés
    async loadCategoryData(category) {
        if (this.data[category]) {
            return this.data[category];
        }
        
        try {
            // Déterminer si nous sommes sur GitHub Pages ou en local
            const isGitHubPages = window.location.hostname.includes('github.io');
            const basePath = isGitHubPages ? '/Hippique' : '';
            
            // AMÉLIORATION: Essayer d'abord de charger les fichiers pondérés pré-calculés
            try {
                const ponderedUrl = `${basePath}/data/${category}_ponderated_latest.json`;
                console.log(`Tentative de chargement du classement pondéré: ${ponderedUrl}`);
                
                const ponderedResponse = await fetch(ponderedUrl);
                if (ponderedResponse.ok) {
                    const ponderedData = await ponderedResponse.json();
                    if (ponderedData && ponderedData.resultats) {
                        console.log(`✅ Classement pondéré pour ${category} chargé avec succès`);
                        this.data[category] = ponderedData.resultats;
                        return ponderedData.resultats;
                    }
                }
            } catch (ponderedError) {
                console.warn(`Impossible de charger le classement pondéré pour ${category}:`, ponderedError);
            }
            
            // Fallback: charger les données brutes et calculer le classement
            console.log(`Fallback: utilisation des données brutes pour ${category}`);
            const response = await fetch(`${basePath}/data/${category}.json`);
            
            if (!response.ok) {
                throw new Error(`Erreur HTTP ${response.status}`);
            }
            
            const data = await response.json();
            if (data && data.resultats) {
                // Calculer le classement pondéré sur place (comme avant)
                console.log(`Calcul du classement pondéré pour ${category}...`);
                const resultatsAvecRangPondere = this.calculateCompositeRanking(data.resultats, category);
                this.data[category] = resultatsAvecRangPondere;
                return resultatsAvecRangPondere;
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
    
    // Fonction pour normaliser et nettoyer un nom (inchangée)
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
    
    // Fonction de classement dense (sans sauts) pour tous les types de tri
    rankWithTiesDense(items, valueGetter) {
        // Trier d'abord par la valeur (décroissante)
        const sorted = [...items].sort((a, b) => {
            const valA = valueGetter(a);
            const valB = valueGetter(b);
            const diff = valB - valA;
            // En cas d'égalité, trier par nom pour garantir la stabilité
            if (diff === 0) {
                const nameA = this.currentCategory === 'chevaux' ? a.Nom : a.NomPostal;
                const nameB = this.currentCategory === 'chevaux' ? b.Nom : b.NomPostal;
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
            const key = this.currentCategory === 'chevaux' ? item.Nom : item.NomPostal;
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
    },
    
    // Fonction pour calculer le classement pondéré (conservée pour fallback)
    calculateCompositeRanking(data, category) {
        if (!data || !data.length) return data;
        
        // Stocker la catégorie actuelle pour utilisation dans les fonctions internes
        this.currentCategory = category;
        
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
        
        // Calcul des rangs pour chaque métrique avec gestion des égalités DENSE
        const victoryRanks = this.rankWithTiesDense(dataCopy, victoryGetter);
        const victoryRateRanks = this.rankWithTiesDense(dataCopy, victoryRateGetter);
        const placeRateRanks = this.rankWithTiesDense(dataCopy, placeRateGetter);
        
        // Calcul du score pondéré pour chaque participant
        dataCopy.forEach(item => {
            const key = category === 'chevaux' ? item.Nom : item.NomPostal;
            
            if (!key) {
                item.ScoreMixte = 999; // Valeur par défaut pour les items mal formés
                return;
            }
            
            // Récupérer les rangs avec égalités DENSES
            const rangVictoires = victoryRanks.get(key) || 999;
            const rangTauxVictoire = victoryRateRanks.get(key) || 999;
            const rangTauxPlace = placeRateRanks.get(key) || 999;
            
            // Déterminer si l'élément a un taux de victoire parfait
            const nbCourses = category === 'chevaux' ? 
                parseInt(item.NbCourses || 0) : 
                parseInt(item.Partants || 0);
            const nbVictoires = category === 'chevaux' ? 
                parseInt(item.NbVictoires || 0) : 
                parseInt(item.Victoires || 0);
            const nbPlaces = category === 'chevaux' ? 
                parseInt(item.NbPlace || 0) : 
                parseInt(item.Place || 0);
            
            const hasPerfectWinRate = nbCourses > 0 && nbVictoires === nbCourses && nbPlaces === 0;
            
            // Pondération adaptative
            let poidsV = 0.5;  // Poids par défaut pour les victoires
            let poidsTV = 0.3; // Poids par défaut pour le taux de victoire
            let poidsTP = 0.2; // Poids par défaut pour le taux de place
            
            // Si taux de victoire parfait, redistribuer le poids du taux de place
            if (hasPerfectWinRate) {
                poidsV += poidsTP; // Redistribuer le poids du taux de place vers les victoires
                poidsTP = 0;       // Ignorer le taux de place
            }
            
            // Calcul du score pondéré avec rangs DENSES
            item.ScoreMixte = (
                poidsV * rangVictoires +
                poidsTV * rangTauxVictoire +
                poidsTP * rangTauxPlace
            ).toFixed(2);
        });
        
        // Tri final par score mixte croissant (meilleur score = plus petit)
        const sortedData = dataCopy.sort((a, b) => {
            const diff = parseFloat(a.ScoreMixte || 999) - parseFloat(b.ScoreMixte || 999);
            if (diff !== 0) return diff;
            
            // Départage par nom en cas d'égalité
            const nameA = category === 'chevaux' ? a.Nom : a.NomPostal;
            const nameB = category === 'chevaux' ? b.Nom : b.NomPostal;
            return nameA.localeCompare(nameB);
        });
        
        // Utiliser une approche plus simple et directe pour le classement dense
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
    },
    
    // Fonction spéciale améliorée pour les éleveurs et propriétaires avec initiales
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
        
        // Extraire le préfixe, l'initiale et le nom de famille
        // Nouvelle expression régulière qui gère mieux les préfixes et initiales
        const match = nomNormalise.match(/^(MME|MR|M)?\s*([A-Z])\.?\s*([A-Z\s]+)$/i);
        
        if (match) {
            const prefixe = match[1] ? match[1].toUpperCase() : '';
            const initiale = match[2].toUpperCase();
            const nomFamille = match[3].trim().toUpperCase();
            
            console.log(`Recherche pour: Préfixe="${prefixe}", Initiale="${initiale}", Nom="${nomFamille}"`);
            
            // Chercher tous les noms qui correspondent au nom de famille et dont le prénom commence par l'initiale
            const correspondances = donneesClassement.filter(item => {
                const nomComplet = this.normaliserNom(item.Nom || item.NomPostal || "");
                
                // Extraire le préfixe, le prénom et le nom de famille du nom complet
                const matchComplet = nomComplet.match(/^(MME|MR|M)?\s*([A-Z]+)(?:\s+([A-Z\s]+))?$/i);
                
                if (!matchComplet) return false;
                
                const prefixeComplet = matchComplet[1] ? matchComplet[1].toUpperCase() : '';
                const prenomComplet = matchComplet[2].toUpperCase();
                const nomFamilleComplet = matchComplet[3] ? matchComplet[3].trim().toUpperCase() : '';
                
                // Vérifier si le prénom commence par l'initiale et si le nom de famille correspond
                const initialeMatch = prenomComplet.startsWith(initiale);
                const nomMatch = nomFamilleComplet.includes(nomFamille) || nomFamille.includes(nomFamilleComplet);
                
                return initialeMatch && nomMatch;
            });
            
            // Si on a trouvé des correspondances, utiliser la meilleure
            if (correspondances.length >= 1) {
                // Prendre celle avec le meilleur rang en cas de plusieurs correspondances
                const meilleure = correspondances.reduce((best, current) => {
                    if (!best) return current;
                    const rangCurrent = parseInt(current.Rang) || 999;
                    const rangBest = parseInt(best.Rang) || 999;
                    return rangCurrent < rangBest ? current : best;
                }, correspondances[0]);
                
                return {
                    score: 0,
                    rang: meilleure.Rang,
                    nomTrouve: meilleure.Nom || meilleure.NomPostal
                };
            }
        }
        
        // Si pas de correspondance avec les initiales, essayer l'approche standard
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
        
        // Rechercher une correspondance exacte d'abord
        for (const item of donneesClassement) {
            const nomItem = categorie === 'chevaux' ? item.Nom : item.NomPostal;
            if (this.normaliserNom(nomItem) === nomNormalise) {
                // Utiliser le rang calculé par calculateCompositeRanking (classement pondéré)
                return parseInt(item.Rang);
            }
        }
        
        // Si pas de correspondance exacte, rechercher une correspondance approximative
        const resultat = this.trouverMeilleurScore(donneesClassement, nom);
        return resultat.rang ? parseInt(resultat.rang) : null;
    },
    
    // Calculer le score moyen pour une liste de noms (propriétaires, éleveurs)
    calculerScoreMoyen(donneesClassement, listeNoms, categorie) {
        // Si c'est une chaîne, la diviser sur les virgules et autres séparateurs possibles
        const noms = typeof listeNoms === 'string' 
            ? listeNoms.split(/\s*[,&\/]\s*/) 
            : [listeNoms];
        
        if (noms.length === 0 || !noms[0]) {
            return { rang: null };
        }
        
        // Trouver le meilleur rang (le plus petit numériquement)
        let meilleurRang = null;
        
        // Parcourir tous les noms et trouver le meilleur rang
        for (const nom of noms) {
            if (!nom) continue;
            
            const rang = this.trouverRangDansClassement(donneesClassement, nom, categorie);
            if (rang !== null) {
                if (meilleurRang === null || rang < meilleurRang) {
                    meilleurRang = rang;
                }
            }
        }
        
        return { rang: meilleurRang };
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
        
        // DEBUG: Logs pour vérifier les rangs
        console.log(`Cheval: ${participant.cheval}, Rang pondéré: ${rangCheval}`);
        console.log(`Jockey: ${participant.jockey}, Rang pondéré: ${rangJockey}`);
        console.log(`Entraineur: ${participant.entraineur}, Rang pondéré: ${rangEntraineur}`);
        
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

        console.log(`Eleveur: ${eleveurValue}, Rang pondéré: ${rangEleveur}`);
        console.log(`Propriétaire: ${proprioValue}, Rang pondéré: ${rangProprio}`);

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

// Exporter le module pour le rendre disponible globalement
window.rankingLoader = rankingLoader;