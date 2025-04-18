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
    
    // Cache des statistiques pour la normalisation
    statsCache: {
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
                        
                        // Calculer les statistiques pour la normalisation
                        this.calculateCategoryStats(category, ponderedData.resultats);
                        
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
                
                // Calculer les statistiques pour la normalisation
                this.calculateCategoryStats(category, resultatsAvecRangPondere);
                
                return resultatsAvecRangPondere;
            }
            
            return [];
        } catch (error) {
            console.error(`Erreur lors du chargement des données ${category}:`, error);
            return [];
        }
    },
    
    // Calculer les statistiques pour la normalisation min-max
    calculateCategoryStats(category, data) {
        if (!data || !data.length) {
            this.statsCache[category] = {
                victoires: { min: 0, max: 1 },        // Éviter division par zéro 
                tauxVictoire: { min: 0, max: 1 },     // Éviter division par zéro
                tauxPlace: { min: 0, max: 1 },        // Éviter division par zéro
                partants: { min: 0, max: 1 }          // Éviter division par zéro
            };
            return;
        }
        
        // Initialiser les statistiques
        const stats = {
            victoires: { min: Number.MAX_VALUE, max: 0 },
            tauxVictoire: { min: Number.MAX_VALUE, max: 0 },
            tauxPlace: { min: Number.MAX_VALUE, max: 0 },
            partants: { min: Number.MAX_VALUE, max: 0 }
        };
        
        // Parcourir les données pour trouver min/max
        data.forEach(item => {
            // Victoires
            const victoires = category === 'chevaux' ? 
                parseInt(item.NbVictoires || 0) : 
                parseInt(item.Victoires || 0);
            stats.victoires.min = Math.min(stats.victoires.min, victoires);
            stats.victoires.max = Math.max(stats.victoires.max, victoires);
            
            // Taux de victoire
            const tauxVictoire = parseFloat(item.TauxVictoire || 0);
            stats.tauxVictoire.min = Math.min(stats.tauxVictoire.min, tauxVictoire);
            stats.tauxVictoire.max = Math.max(stats.tauxVictoire.max, tauxVictoire);
            
            // Taux de place
            const tauxPlace = parseFloat(item.TauxPlace || 0);
            stats.tauxPlace.min = Math.min(stats.tauxPlace.min, tauxPlace);
            stats.tauxPlace.max = Math.max(stats.tauxPlace.max, tauxPlace);
            
            // Partants
            const partants = category === 'chevaux' ? 
                parseInt(item.NbCourses || 0) : 
                parseInt(item.Partants || 0);
            stats.partants.min = Math.min(stats.partants.min, partants);
            stats.partants.max = Math.max(stats.partants.max, partants);
        });
        
        // Éviter les divisions par zéro si min==max
        if (stats.victoires.min === stats.victoires.max) {
            stats.victoires.min = Math.max(0, stats.victoires.max - 1);
        }
        if (stats.tauxVictoire.min === stats.tauxVictoire.max) {
            stats.tauxVictoire.min = Math.max(0, stats.tauxVictoire.max - 0.1);
        }
        if (stats.tauxPlace.min === stats.tauxPlace.max) {
            stats.tauxPlace.min = Math.max(0, stats.tauxPlace.max - 0.1);
        }
        if (stats.partants.min === stats.partants.max) {
            stats.partants.min = Math.max(0, stats.partants.max - 1);
        }
        
        // Stocker les statistiques dans le cache
        this.statsCache[category] = stats;
        
        console.log(`Statistiques calculées pour ${category}:`, stats);
    },
    
    // Normaliser une valeur avec min-max scaling (0-1)
    normalizeMinMax(value, min, max) {
        if (min === max) return 0.5; // Éviter division par zéro
        return (value - min) / (max - min);
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
    
    // Fonction pour normaliser et nettoyer un nom (améliorée pour les écuries)
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
        
        // Standardiser les préfixes pour écuries (EC, ECURIE, etc.)
        nomNormalise = nomNormalise.replace(/^EC\./i, "ECURIE ")
                                .replace(/^EC\s+/i, "ECURIE ")
                                .replace(/^ECURIES?\s+/i, "ECURIE ");
        
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
            return { score: 50, rang: null, item: null };
        }
        
        // Ne s'applique qu'aux éleveurs et propriétaires
        if (categorie !== 'eleveurs' && categorie !== 'proprietaires') {
            return this.trouverMeilleurScore(donneesClassement, nomAvecInitiale);
        }
        
        // Normaliser le nom avec l'initiale
        const nomNormalise = this.normaliserNom(nomAvecInitiale);
        
        // Vérifier si c'est une écurie avec préfixe EC.
        if (nomNormalise.startsWith('ECURIE') || nomAvecInitiale.toUpperCase().startsWith('EC.')) {
            // Recherche d'écurie - traitement spécial
            const nomEcurie = nomNormalise.replace(/^ECURIE\s+/i, '').trim();
            
            console.log(`Recherche d'écurie pour: "${nomEcurie}"`);
            
            // Chercher les correspondances avec les écuries
            const correspondances = donneesClassement.filter(item => {
                const nomItem = this.normaliserNom(item.Nom || item.NomPostal || "");
                
                // Vérifier si c'est une écurie
                if (nomItem.startsWith('ECURIE')) {
                    const nomEcurieItem = nomItem.replace(/^ECURIE\s+/i, '').trim();
                    return nomEcurieItem.includes(nomEcurie) || nomEcurie.includes(nomEcurieItem);
                }
                
                return false;
            });
            
            if (correspondances.length >= 1) {
                // Trier par rang (prendre le meilleur)
                const meilleure = correspondances.reduce((best, current) => {
                    if (!best) return current;
                    const rangCurrent = parseInt(current.Rang) || 999;
                    const rangBest = parseInt(best.Rang) || 999;
                    return rangCurrent < rangBest ? current : best;
                }, correspondances[0]);
                
                console.log(`Écurie trouvée: ${meilleure.Nom || meilleure.NomPostal}, Rang: ${meilleure.Rang}`);
                
                return {
                    score: 0,
                    rang: meilleure.Rang,
                    nomTrouve: meilleure.Nom || meilleure.NomPostal,
                    item: meilleure
                };
            }
        }
        
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
                    nomTrouve: meilleure.Nom || meilleure.NomPostal,
                    item: meilleure
                };
            }
        }
        
        // Si pas de correspondance avec les initiales, essayer l'approche standard
        return this.trouverMeilleurScore(donneesClassement, nomAvecInitiale);
    },
    
    // Trouver le meilleur score pour un nom dans les données de classement
    trouverMeilleurScore(donneesClassement, nom) {
        if (!nom || !donneesClassement || !donneesClassement.length) {
            return { score: 0, rang: null, item: null };
        }
        
        const nomNormalise = this.normaliserNom(nom);
        
        // Traitement spécial pour les écuries
        if (nomNormalise.startsWith('ECURIE') || nom.toUpperCase().startsWith('EC.')) {
            const nomEcurie = nomNormalise.replace(/^ECURIE\s+/i, '').trim();
            
            // Recherche d'écurie simplifiée
            for (const item of donneesClassement) {
                const nomItem = this.normaliserNom(item.Nom || item.NomPostal || "");
                if (nomItem.startsWith('ECURIE') && 
                    (nomItem.includes(nomEcurie) || nomEcurie.includes(nomItem.replace(/^ECURIE\s+/i, '').trim()))) {
                    return {
                        score: 0,
                        rang: item.Rang,
                        similarite: 90,
                        item: item
                    };
                }
            }
        }
        
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
                similarite: correspondances[0].similarite,
                item: correspondances[0].item
            };
        }
        
        return { score: 0, rang: null, item: null }; // Valeur par défaut si non trouvé
    },
    
    // Trouver l'item correspondant à un nom dans un classement
    trouverItemDansClassement(donneesClassement, nom, categorie) {
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
            
            // Chercher le meilleur item parmi tous les noms
            let meilleurItem = null;
            let meilleurRang = null;
            
            for (const nomIndividuel of noms) {
                if (!nomIndividuel.trim()) continue;
                
                console.log(`Traitement du propriétaire/éleveur: "${nomIndividuel}"`);
                const resultat = this.trouverPersonneParInitiale(donneesClassement, nomIndividuel, categorie);
                if (resultat.item && resultat.rang !== null) {
                    const rang = parseInt(resultat.rang);
                    if (meilleurRang === null || rang < meilleurRang) {
                        meilleurRang = rang;
                        meilleurItem = resultat.item;
                        console.log(`Nouveau meilleur élément trouvé: ${meilleurItem.Nom || meilleurItem.NomPostal} (rang ${rang}) pour "${nomIndividuel}"`);
                    }
                }
            }
            
            return meilleurItem;
        }
        
        // Pour les autres catégories
        const nomNormalise = this.normaliserNom(nom);
        
        // Rechercher une correspondance exacte d'abord
        for (const item of donneesClassement) {
            const nomItem = categorie === 'chevaux' ? item.Nom : item.NomPostal;
            if (this.normaliserNom(nomItem) === nomNormalise) {
                return item;
            }
        }
        
        // Si pas de correspondance exacte, rechercher une correspondance approximative
        const resultat = this.trouverMeilleurScore(donneesClassement, nom);
        return resultat.item;
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
                if (!nomIndividuel.trim()) continue;
                
                console.log(`Traitement du propriétaire/éleveur: "${nomIndividuel}"`);
                const resultat = this.trouverPersonneParInitiale(donneesClassement, nomIndividuel, categorie);
                if (resultat.rang !== null) {
                    const rang = parseInt(resultat.rang);
                    if (meilleurRang === null || rang < meilleurRang) {
                        meilleurRang = rang;
                        console.log(`Nouveau meilleur rang trouvé: ${rang} pour "${nomIndividuel}"`);
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
    
    // Calculer le score prédictif normalisé pour un participant
    calculerScoreParticipant(participant) {
        // Récupérer les items pour chaque acteur
        const itemCheval = this.trouverItemDansClassement(this.data.chevaux, participant.cheval, 'chevaux');
        const itemJockey = this.trouverItemDansClassement(this.data.jockeys, participant.jockey, 'jockeys');
        const itemEntraineur = this.trouverItemDansClassement(this.data.entraineurs, participant.entraineur, 'entraineurs');
        
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
        
        const itemEleveur = this.trouverItemDansClassement(this.data.eleveurs, eleveurValue, 'eleveurs');
        const itemProprio = this.trouverItemDansClassement(this.data.proprietaires, proprioValue, 'proprietaires');
        
        // Récupérer les rangs pour le système de secours et l'affichage
        const rangCheval = itemCheval ? parseInt(itemCheval.Rang) : null;
        const rangJockey = itemJockey ? parseInt(itemJockey.Rang) : null;
        const rangEntraineur = itemEntraineur ? parseInt(itemEntraineur.Rang) : null;
        const rangEleveur = itemEleveur ? parseInt(itemEleveur.Rang) : null;
        const rangProprio = itemProprio ? parseInt(itemProprio.Rang) : null;
        
        // DEBUG: Logs pour vérifier les rangs
        console.log(`Cheval: ${participant.cheval}, Rang pondéré: ${rangCheval}`);
        console.log(`Jockey: ${participant.jockey}, Rang pondéré: ${rangJockey}`);
        console.log(`Entraineur: ${participant.entraineur}, Rang pondéré: ${rangEntraineur}`);
        console.log(`Eleveur: ${eleveurValue}, Rang pondéré: ${rangEleveur}`);
        console.log(`Propriétaire: ${proprioValue}, Rang pondéré: ${rangProprio}`);
        
        // NOUVELLE APPROCHE: Calcul avec normalisation des métriques réelles
        // Préparation des scores normalisés par défaut
        const scores = {
            cheval: { score: 0.3, rang: "NC" },       // Valeur par défaut si non trouvé (milieu de l'échelle)
            jockey: { score: 0.3, rang: "NC" },       // Valeur par défaut si non trouvé (milieu de l'échelle)
            entraineur: { score: 0.3, rang: "NC" },   // Valeur par défaut si non trouvé (milieu de l'échelle)
            eleveur: { score: 0.3, rang: "NC" },      // Valeur par défaut si non trouvé (milieu de l'échelle)
            proprietaire: { score: 0.3, rang: "NC" }  // Valeur par défaut si non trouvé (milieu de l'échelle)
        };
        
        // Calcul du score normalisé pour le cheval
        if (itemCheval && this.statsCache.chevaux) {
            const nbVictoires = parseInt(itemCheval.NbVictoires || 0);
            const tauxVictoire = parseFloat(itemCheval.TauxVictoire || 0);
            const tauxPlace = parseFloat(itemCheval.TauxPlace || 0);
            
            // Normalisation min-max
            const scoreVictoires = this.normalizeMinMax(
                nbVictoires, 
                this.statsCache.chevaux.victoires.min, 
                this.statsCache.chevaux.victoires.max
            );
            
            const scoreTauxVictoire = this.normalizeMinMax(
                tauxVictoire, 
                this.statsCache.chevaux.tauxVictoire.min, 
                this.statsCache.chevaux.tauxVictoire.max
            );
            
            const scoreTauxPlace = this.normalizeMinMax(
                tauxPlace, 
                this.statsCache.chevaux.tauxPlace.min, 
                this.statsCache.chevaux.tauxPlace.max
            );
            
            // Pondération adaptive des métriques (similaire à l'ancien système)
            let poidsV = 0.5;   // Victoires
            let poidsTV = 0.3;  // Taux de victoire
            let poidsTP = 0.2;  // Taux de place
            
            // Si taux de victoire parfait, favoriser encore plus
            if (tauxVictoire === 1.0) {
                poidsV += poidsTP; // Redistribuer le poids du taux de place vers les victoires
                poidsTP = 0;       // Ignorer le taux de place
            }
            
            // Score final pondéré pour le cheval
            const scoreCheval = (
                poidsV * scoreVictoires +
                poidsTV * scoreTauxVictoire +
                poidsTP * scoreTauxPlace
            );
            
            // Conserver le score et le rang pour l'affichage
            scores.cheval = {
                score: scoreCheval,
                victoires: scoreVictoires, 
                tauxVictoire: scoreTauxVictoire,
                tauxPlace: scoreTauxPlace,
                rang: rangCheval
            };
        }
        
        // Calcul du score normalisé pour le jockey
        if (itemJockey && this.statsCache.jockeys) {
            const nbVictoires = parseInt(itemJockey.Victoires || 0);
            const tauxVictoire = parseFloat(itemJockey.TauxVictoire || 0);
            const tauxPlace = parseFloat(itemJockey.TauxPlace || 0);
            
            // Normalisation min-max
            const scoreVictoires = this.normalizeMinMax(
                nbVictoires, 
                this.statsCache.jockeys.victoires.min, 
                this.statsCache.jockeys.victoires.max
            );
            
            const scoreTauxVictoire = this.normalizeMinMax(
                tauxVictoire, 
                this.statsCache.jockeys.tauxVictoire.min, 
                this.statsCache.jockeys.tauxVictoire.max
            );
            
            const scoreTauxPlace = this.normalizeMinMax(
                tauxPlace, 
                this.statsCache.jockeys.tauxPlace.min, 
                this.statsCache.jockeys.tauxPlace.max
            );
            
            // Pondération
            const scoreJockey = (
                0.4 * scoreVictoires +
                0.4 * scoreTauxVictoire +
                0.2 * scoreTauxPlace
            );
            
            scores.jockey = {
                score: scoreJockey,
                rang: rangJockey
            };
        }
        
        // Calcul du score normalisé pour l'entraineur
        if (itemEntraineur && this.statsCache.entraineurs) {
            const nbVictoires = parseInt(itemEntraineur.Victoires || 0);
            const tauxVictoire = parseFloat(itemEntraineur.TauxVictoire || 0);
            const tauxPlace = parseFloat(itemEntraineur.TauxPlace || 0);
            
            // Normalisation min-max
            const scoreVictoires = this.normalizeMinMax(
                nbVictoires, 
                this.statsCache.entraineurs.victoires.min, 
                this.statsCache.entraineurs.victoires.max
            );
            
            const scoreTauxVictoire = this.normalizeMinMax(
                tauxVictoire, 
                this.statsCache.entraineurs.tauxVictoire.min, 
                this.statsCache.entraineurs.tauxVictoire.max
            );
            
            const scoreTauxPlace = this.normalizeMinMax(
                tauxPlace, 
                this.statsCache.entraineurs.tauxPlace.min, 
                this.statsCache.entraineurs.tauxPlace.max
            );
            
            // Pondération
            const scoreEntraineur = (
                0.4 * scoreVictoires +
                0.4 * scoreTauxVictoire +
                0.2 * scoreTauxPlace
            );
            
            scores.entraineur = {
                score: scoreEntraineur,
                rang: rangEntraineur
            };
        }
        
        // Calcul du score normalisé pour l'éleveur
        if (itemEleveur && this.statsCache.eleveurs) {
            const nbVictoires = parseInt(itemEleveur.Victoires || 0);
            const tauxVictoire = parseFloat(itemEleveur.TauxVictoire || 0);
            const tauxPlace = parseFloat(itemEleveur.TauxPlace || 0);
            
            // Normalisation min-max
            const scoreVictoires = this.normalizeMinMax(
                nbVictoires, 
                this.statsCache.eleveurs.victoires.min, 
                this.statsCache.eleveurs.victoires.max
            );
            
            const scoreTauxVictoire = this.normalizeMinMax(
                tauxVictoire, 
                this.statsCache.eleveurs.tauxVictoire.min, 
                this.statsCache.eleveurs.tauxVictoire.max
            );
            
            const scoreTauxPlace = this.normalizeMinMax(
                tauxPlace, 
                this.statsCache.eleveurs.tauxPlace.min, 
                this.statsCache.eleveurs.tauxPlace.max
            );
            
            // Pondération
            const scoreEleveur = (
                0.4 * scoreVictoires +
                0.4 * scoreTauxVictoire +
                0.2 * scoreTauxPlace
            );
            
            scores.eleveur = {
                score: scoreEleveur,
                rang: rangEleveur
            };
        }
        
        // Calcul du score normalisé pour le propriétaire
        if (itemProprio && this.statsCache.proprietaires) {
            const nbVictoires = parseInt(itemProprio.Victoires || 0);
            const tauxVictoire = parseFloat(itemProprio.TauxVictoire || 0);
            const tauxPlace = parseFloat(itemProprio.TauxPlace || 0);
            
            // Normalisation min-max
            const scoreVictoires = this.normalizeMinMax(
                nbVictoires, 
                this.statsCache.proprietaires.victoires.min, 
                this.statsCache.proprietaires.victoires.max
            );
            
            const scoreTauxVictoire = this.normalizeMinMax(
                tauxVictoire, 
                this.statsCache.proprietaires.tauxVictoire.min, 
                this.statsCache.proprietaires.tauxVictoire.max
            );
            
            const scoreTauxPlace = this.normalizeMinMax(
                tauxPlace, 
                this.statsCache.proprietaires.tauxPlace.min, 
                this.statsCache.proprietaires.tauxPlace.max
            );
            
            // Pondération
            const scoreProprio = (
                0.4 * scoreVictoires +
                0.4 * scoreTauxVictoire +
                0.2 * scoreTauxPlace
            );
            
            scores.proprietaire = {
                score: scoreProprio,
                rang: rangProprio
            };
        }
        
        // Appliquer la formule de pondération finale du score prédictif
        // avec les scores normalisés (entre 0 et 1)
        const scorePredictif = (
            0.55 * scores.cheval.score +
            0.15 * scores.jockey.score +
            0.12 * scores.entraineur.score +
            0.10 * scores.eleveur.score +
            0.08 * scores.proprietaire.score
        );
        
        // Conversion du score en échelle 0-100 pour plus de lisibilité
        const scoreFinal = (scorePredictif * 100).toFixed(1);
        
        // FALLBACK: si les statistiques ne sont pas disponibles,
        // utiliser l'ancien système d'inversion de rangs
        if (scoreFinal <= 0) {
            console.log(`Utilisation du système de secours basé sur les rangs pour ${participant.cheval}`);
            // Inverser les rangs pour obtenir un score (plus le rang est bas, meilleur est le score)
            const maxRang = 100;
            const scoreCheval = rangCheval ? Math.max(0, maxRang - rangCheval) : 30;
            const scoreJockey = rangJockey ? Math.max(0, maxRang - rangJockey) : 30;
            const scoreEntraineur = rangEntraineur ? Math.max(0, maxRang - rangEntraineur) : 30;
            const scoreEleveur = rangEleveur ? Math.max(0, maxRang - rangEleveur) : 30;
            const scoreProprio = rangProprio ? Math.max(0, maxRang - rangProprio) : 30;
            
            // Appliquer la formule de pondération, mais avec les rangs inversés
            const scoreSecours = (
                0.55 * scoreCheval +
                0.15 * scoreJockey +
                0.12 * scoreEntraineur +
                0.10 * scoreEleveur +
                0.08 * scoreProprio
            );
            
            return {
                score: scoreSecours.toFixed(1),
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
        }
        
        // Retourner le score et les détails
        return {
            score: scoreFinal,
            details: {
                cheval: {
                    rang: rangCheval || "NC",
                    score: (scores.cheval.score * 100).toFixed(1)
                },
                jockey: {
                    rang: rangJockey || "NC",
                    score: (scores.jockey.score * 100).toFixed(1)
                },
                entraineur: {
                    rang: rangEntraineur || "NC",
                    score: (scores.entraineur.score * 100).toFixed(1)
                },
                eleveur: {
                    rang: rangEleveur || "NC",
                    score: (scores.eleveur.score * 100).toFixed(1)
                },
                proprietaire: {
                    rang: rangProprio || "NC",
                    score: (scores.proprietaire.score * 100).toFixed(1)
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