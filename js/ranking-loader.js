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
    
    // Table de correspondance manuelle pour les cas problématiques
    correspondanceManuelle: {
        // Format: "Nom dans la course": "Nom dans le classement"
        "CORTEZ BANK H.PS. 6 A.": "CORTEZ BANK (GB)",
        "CORTEZ BANK H.P.S. 6 A.": "CORTEZ BANK (GB)",
        "CORTEZ BANK": "CORTEZ BANK (GB)",
        "LEHMAN (GB) M.PS. 6 A.": "LEHMAN (GB)",
        "LEHMAN M.PS. 6 A.": "LEHMAN (GB)",
        "LEHMAN H.PS. 6 A.": "LEHMAN (GB)",
        "BENI KHIAR M.PS. 7 A.": "BENI KHIAR",
        "RONNIE ROCKET H.PS. 5 A.": "RONNIE ROCKET",
        "LADY MADININA F.PS. 5 A.": "LADY MADININA",
        "DADIDOM H.PS. 7 A.": "DADIDOM"
        // Ajoutez d'autres cas problématiques au besoin
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
    
    // Fonction pour normaliser et nettoyer un nom (améliorée pour les chevaux et écuries)
    normaliserNom(nom) {
        if (!nom) return "";
        
        // Vérifier d'abord la table de correspondance manuelle
        const nomUpper = nom.toUpperCase().trim();
        if (this.correspondanceManuelle[nomUpper]) {
            console.log(`Correspondance manuelle trouvée: "${nomUpper}" -> "${this.correspondanceManuelle[nomUpper]}"`);
            return this.correspondanceManuelle[nomUpper];
        }
        
        // Convertir en majuscules et supprimer les espaces superflus
        let nomNormalise = nomUpper;
        
        // AMÉLIORATION: Expression régulière simplifiée pour les noms de chevaux
        // Format: NOM (ORIGINE) [Suffixes éventuels comme H.PS. 5 a.]
        const matchCheval = nomNormalise.match(/^([A-Za-zÀ-ÖØ-öø-ÿ\s\-']+?)(\s*\(([A-Za-z]+)\))?(\s+[HFM]\.?P\.?S\.?.*)?$/i);
        
        if (matchCheval) {
            const nomBase = matchCheval[1].trim();
            const origine = matchCheval[3] ? `(${matchCheval[3].trim()})` : "";
            
            // Reconstruire le nom standardisé
            nomNormalise = nomBase + (origine ? ` ${origine}` : "");
            console.log(`Nom cheval normalisé: "${nom}" -> "${nomNormalise}"`);
        }
        
        // Standardiser les préfixes pour personnes
        nomNormalise = nomNormalise.replace(/^M\\.\\s*/i, "MR ")
                                .replace(/^MME\\.\\s*/i, "MME ")
                                .replace(/^MLLE\\.\\s*/i, "MLLE ");
        
        // Standardiser les préfixes pour écuries (EC, ECURIE, etc.)
        nomNormalise = nomNormalise.replace(/^EC\\./i, "ECURIE ")
                                .replace(/^EC\\s+/i, "ECURIE ")
                                .replace(/^ECURIES?\\s+/i, "ECURIE ");
        
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
            const nomEcurie = nomNormalise.replace(/^ECURIE\\s+/i, '').trim();
            
            console.log(`Recherche d'écurie pour: "${nomEcurie}"`);
            
            // Chercher les correspondances avec les écuries
            const correspondances = donneesClassement.filter(item => {
                const nomItem = this.normaliserNom(item.Nom || item.NomPostal || "");
                
                // Vérifier si c'est une écurie
                if (nomItem.startsWith('ECURIE')) {
                    const nomEcurieItem = nomItem.replace(/^ECURIE\\s+/i, '').trim();
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
        const match = nomNormalise.match(/^(MME|MR|M)?\\s*([A-Z])\\.?\\s*([A-Z\\s]+)$/i);
        
        if (match) {
            const prefixe = match[1] ? match[1].toUpperCase() : '';
            const initiale = match[2].toUpperCase();
            const nomFamille = match[3].trim().toUpperCase();
            
            console.log(`Recherche pour: Préfixe="${prefixe}", Initiale="${initiale}", Nom="${nomFamille}"`);
            
            // Chercher tous les noms qui correspondent au nom de famille et dont le prénom commence par l'initiale
            const correspondances = donneesClassement.filter(item => {
                const nomComplet = this.normaliserNom(item.Nom || item.NomPostal || "");
                
                // Extraire le préfixe, le prénom et le nom de famille du nom complet
                const matchComplet = nomComplet.match(/^(MME|MR|M)?\\s*([A-Z]+)(?:\\s+([A-Z\\s]+))?$/i);
                
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
    // FONCTION AMÉLIORÉE AVEC RECHERCHE PROGRESSIVE
    trouverMeilleurScore(donneesClassement, nom) {
        if (!nom || !donneesClassement || !donneesClassement.length) {
            return { score: 0, rang: null, item: null };
        }
        
        // Vérifier d'abord la table de correspondance manuelle
        const nomUpper = nom.toUpperCase().trim();
        if (this.correspondanceManuelle[nomUpper]) {
            const nomCorrespondance = this.correspondanceManuelle[nomUpper];
            console.log(`Correspondance manuelle trouvée: "${nomUpper}" -> "${nomCorrespondance}"`);
            
            // Rechercher la correspondance dans les données de classement
            for (const item of donneesClassement) {
                const nomItem = item.Nom || item.NomPostal || "";
                if (this.normaliserNom(nomItem) === this.normaliserNom(nomCorrespondance)) {
                    return {
                        score: 0,
                        rang: item.Rang,
                        similarite: 100,
                        item: item
                    };
                }
            }
        }
        
        const nomNormalise = this.normaliserNom(nom);
        console.log(`Recherche pour: "${nom}" normalisé en "${nomNormalise}"`);
        
        // STRATÉGIE 1: Correspondance exacte
        for (const item of donneesClassement) {
            const nomItem = item.Nom || item.NomPostal || "";
            const nomItemNormalise = this.normaliserNom(nomItem);
            
            if (nomItemNormalise === nomNormalise) {
                console.log(`Correspondance exacte trouvée: "${nomItem}"`);
                return {
                    score: 0,
                    rang: item.Rang,
                    similarite: 100,
                    item: item
                };
            }
        }
        
        // STRATÉGIE 2: Extraire le nom sans suffixes ni origines pour les chevaux
        // Par exemple: "CORTEZ BANK (GB) H.PS. 6 a." -> "CORTEZ BANK"
        const nomSansSuffixe = nomNormalise.replace(/\s*\([^)]+\)|\s+[HFM]\.?P\.?S\.?.*/gi, "").trim();
        if (nomSansSuffixe !== nomNormalise) {
            console.log(`Recherche sans suffixe: "${nomSansSuffixe}"`);
            
            for (const item of donneesClassement) {
                const nomItem = item.Nom || item.NomPostal || "";
                const nomItemSansSuffixe = this.normaliserNom(nomItem).replace(/\s*\([^)]+\)|\s+[HFM]\.?P\.?S\.?.*/gi, "").trim();
                
                if (nomItemSansSuffixe === nomSansSuffixe) {
                    console.log(`Correspondance sans suffixe trouvée: "${nomItem}"`);
                    return {
                        score: 0,
                        rang: item.Rang,
                        similarite: 95,
                        item: item
                    };
                }
            }
        }
        
        // STRATÉGIE 3: Vérifier si le nom est contenu dans l'autre
        for (const item of donneesClassement) {
            const nomItem = item.Nom || item.NomPostal || "";
            const nomItemNormalise = this.normaliserNom(nomItem);
            
            // Si l'un contient l'autre (par exemple "CORTEZ BANK" dans "CORTEZ BANK (GB)")
            if (nomItemNormalise.includes(nomSansSuffixe) || nomSansSuffixe.includes(nomItemNormalise)) {
                console.log(`Correspondance par inclusion trouvée: "${nom}" avec "${nomItem}"`);
                return {
                    score: 0,
                    rang: item.Rang,
                    similarite: 90,
                    item: item
                };
            }
        }
        
        // STRATÉGIE 4: Écuries (cas spécial)
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
        
        // STRATÉGIE 5: Correspondance partielle par mots communs
        const correspondances = [];
        const motsNomOriginal = nomSansSuffixe.split(/\s+/).filter(m => m.length > 1);
        
        donneesClassement.forEach(item => {
            const nomReference = this.normaliserNom(item.Nom || item.NomPostal || "");
            const nomReferenceSansSuffixe = nomReference.replace(/\s*\([^)]+\)|\s+[HFM]\.?P\.?S\.?.*/gi, "").trim();
            const motsRef = nomReferenceSansSuffixe.split(/\s+/).filter(m => m.length > 1);
            
            // Compter les mots en commun
            const motsCommuns = motsRef.filter(mot => motsNomOriginal.includes(mot)).length;
            
            if (motsCommuns > 0) {
                // Score basé sur le pourcentage de mots en commun
                const similarite = Math.min(80, (motsCommuns / Math.max(motsRef.length, motsNomOriginal.length)) * 100);
                
                if (similarite > 50) { // Seuil minimum de similarité
                    correspondances.push({
                        item: item,
                        similarite: similarite
                    });
                }
            }
        });
        
        // Trier par similarité décroissante
        correspondances.sort((a, b) => b.similarite - a.similarite);
        
        // Si on a trouvé des correspondances, retourner la meilleure
        if (correspondances.length > 0) {
            console.log(`Meilleure correspondance partielle: "${correspondances[0].item.Nom || correspondances[0].item.NomPostal}" (similarité: ${correspondances[0].similarite}%)`);
            return {
                score: 0,
                rang: correspondances[0].item.Rang,
                similarite: correspondances[0].similarite,
                item: correspondances[0].item
            };
        }
        
        // Aucune correspondance trouvée
        console.log(`Aucune correspondance trouvée pour "${nom}"`);
        return { score: 0, rang: null, item: null };
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
                ? nom.split(/\s*[,&\/]\s*|\set\s|\sand\s/i).filter(n => n.trim())
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
        
        // Pour les chevaux et autres catégories
        // Vérifier d'abord la table de correspondance manuelle
        const nomUpper = (nom || "").toUpperCase().trim();
        if (this.correspondanceManuelle[nomUpper]) {
            nom = this.correspondanceManuelle[nomUpper];
            console.log(`Correspondance manuelle utilisée: "${nomUpper}" -> "${nom}"`);
        }
        
        const nomNormalise = this.normaliserNom(nom);
        console.log(`Recherche de "${nom}" normalisé en "${nomNormalise}" dans la catégorie ${categorie}`);
        
        // Amélioré - utiliser toute la stratégie de recherche progressive
        const resultat = this.trouverMeilleurScore(donneesClassement, nom);
        if (resultat.item) {
            console.log(`Correspondance trouvée pour "${nom}": "${resultat.item.Nom || resultat.item.NomPostal}" (similarité: ${resultat.similarite || 'N/A'}%)`);
        } else {
            console.log(`⚠️ Aucune correspondance trouvée pour "${nom}" dans ${categorie}`);
        }
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
                ? nom.split(/\s*[,&\/]\s*|\set\s|\sand\s/i).filter(n => n.trim())
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
        
        // Pour les autres catégories - utiliser la fonction complète de recherche
        // Vérifier d'abord la table de correspondance manuelle
        const nomUpper = (nom || "").toUpperCase().trim();
        if (this.correspondanceManuelle[nomUpper]) {
            nom = this.correspondanceManuelle[nomUpper];
            console.log(`Correspondance manuelle utilisée: "${nomUpper}" -> "${nom}"`);
        }
        
        const resultat = this.trouverMeilleurScore(donneesClassement, nom);
        return resultat.rang ? parseInt(resultat.rang) : null;
    },
    
    // Calculer le score moyen pour une liste de noms (propriétaires, éleveurs)
    calculerScoreMoyen(donneesClassement, listeNoms, categorie) {
        // Si c'est une chaîne, la diviser sur les virgules et autres séparateurs possibles
        const noms = typeof listeNoms === 'string' 
            ? listeNoms.split(/\s*[,&\/]\s*|\set\s|\sand\s/i).filter(n => n.trim())
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
    
    // Fonction pour générer automatiquement la table de correspondance pour les chevaux dans une course
    // NOUVELLE FONCTION: Ajouter des entrées à la table de correspondance en fonction des cas rencontrés
    ajouterCorrespondanceAutomatique(nomCourse, nomClassement) {
        if (!nomCourse || !nomClassement) return;
        
        // Standardiser les deux noms pour la comparaison
        const nomCourseTrim = nomCourse.toUpperCase().trim();
        const nomClassementTrim = nomClassement.toUpperCase().trim();
        
        // Ne pas ajouter si c'est déjà identique ou déjà dans la table
        if (nomCourseTrim === nomClassementTrim || this.correspondanceManuelle[nomCourseTrim]) {
            return;
        }
        
        // Ajouter à la table de correspondance
        this.correspondanceManuelle[nomCourseTrim] = nomClassementTrim;
        console.log(`✅ Nouvelle correspondance ajoutée: "${nomCourseTrim}" -> "${nomClassementTrim}"`);
        
        // Ajouter aussi des variantes sans suffixes
        const nomCourseSansSuffixe = nomCourseTrim.replace(/\s+[HFM]\.?P\.?S\.?.*/gi, "").trim();
        if (nomCourseSansSuffixe !== nomCourseTrim) {
            this.correspondanceManuelle[nomCourseSansSuffixe] = nomClassementTrim;
            console.log(`✅ Variante sans suffixe ajoutée: "${nomCourseSansSuffixe}" -> "${nomClassementTrim}"`);
        }
    },
    
    // NOUVELLE VERSION: Calculer le score prédictif pour un participant avec NC dynamique
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
        
        // Récupérer les rangs pour le calcul de score
        const rangCheval = itemCheval ? parseInt(itemCheval.Rang) : null;
        const rangJockey = itemJockey ? parseInt(itemJockey.Rang) : null;
        const rangEntraineur = itemEntraineur ? parseInt(itemEntraineur.Rang) : null;
        const rangEleveur = itemEleveur ? parseInt(itemEleveur.Rang) : null;
        const rangProprio = itemProprio ? parseInt(itemProprio.Rang) : null;
        
        // Si on a trouvé un cheval dans le classement, ajouter automatiquement à la table de correspondance
        if (itemCheval && participant.cheval) {
            this.ajouterCorrespondanceAutomatique(participant.cheval, itemCheval.Nom);
        }
        
        // Logs pour debug
        console.log(`Rangs récupérés pour ${participant.cheval}: `, {
            cheval: rangCheval,
            jockey: rangJockey,
            entraineur: rangEntraineur,
            eleveur: rangEleveur,
            proprietaire: rangProprio
        });
        
        // Paramètres du système
        const maxRang = 100; // Rang maximal pour la normalisation
        
        // NOUVEAU: Calcul dynamique de la valeur par défaut pour les NC
        const rangsPresents = [rangCheval, rangJockey, rangEntraineur, rangEleveur, rangProprio]
            .filter(rang => rang !== null);
        
        // Calcul de l'indice de confiance
        const elementsPresents = [
            !!rangCheval, 
            !!rangJockey,
            !!rangEntraineur, 
            !!rangEleveur,
            !!rangProprio
        ].filter(Boolean).length;
        
        const indiceConfiance = elementsPresents / 5;
        
        // NOUVEAU: Valeur par défaut dynamique basée sur la moyenne des éléments présents
        let valeurNC;
        
        if (rangsPresents.length > 0) {
            // Calculer la moyenne des rangs présents
            const moyenneRangs = rangsPresents.reduce((sum, rang) => sum + rang, 0) / rangsPresents.length;
            
            // Convertir en score (inverser et ajuster)
            const scoreBaseSurMoyenne = Math.max(0, maxRang - moyenneRangs);
            
            // Atténuer le score selon l'indice de confiance
            // Plus il y a d'éléments manquants, plus on atténue la moyenne
            valeurNC = scoreBaseSurMoyenne * Math.max(0.5, indiceConfiance);
            
            // Garantir une valeur minimale et maximale raisonnable
            valeurNC = Math.max(10, Math.min(valeurNC, maxRang * 0.4));
            
            console.log(`Valeur NC dynamique calculée: ${valeurNC} (basée sur moyenne des rangs: ${moyenneRangs})`);
        } else {
            // Si aucun élément présent, utiliser une valeur par défaut modérée
            valeurNC = maxRang * 0.15; // 15% du maximum
            console.log(`Aucun élément présent, valeur NC par défaut: ${valeurNC}`);
        }
        
        // Inverser les rangs pour obtenir des scores
        const scoreCheval = rangCheval ? Math.max(0, maxRang - rangCheval) : valeurNC;
        const scoreJockey = rangJockey ? Math.max(0, maxRang - rangJockey) : valeurNC;
        const scoreEntraineur = rangEntraineur ? Math.max(0, maxRang - rangEntraineur) : valeurNC;
        const scoreEleveur = rangEleveur ? Math.max(0, maxRang - rangEleveur) : valeurNC;
        const scoreProprio = rangProprio ? Math.max(0, maxRang - rangProprio) : valeurNC;
        
        // AMÉLIORATION: Ajuster l'indice de confiance selon l'importance des éléments manquants
        let indiceConfianceAjuste = indiceConfiance;
        
        // Si le cheval est manquant, c'est plus problématique
        if (!rangCheval) {
            indiceConfianceAjuste *= 0.8; // Pénalité plus forte si le cheval est manquant
        }
        
        // Appliquer la formule de pondération avec les rangs inversés
        const scoreFinal = (
            0.55 * scoreCheval +
            0.15 * scoreJockey +
            0.12 * scoreEntraineur +
            0.10 * scoreEleveur +
            0.08 * scoreProprio
        );
        
        // Retourner le résultat
        return {
            score: scoreFinal.toFixed(1),
            indiceConfiance: indiceConfianceAjuste.toFixed(2),
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