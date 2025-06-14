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
    
    // Cache des correspondances découvertes pour améliorer les performances
    correspondancesDecouvertes: {},
    
    // Table de correspondance manuelle pour les cas problématiques
    correspondanceManuelle: {
        // Format: "Nom dans la course": "Nom dans le classement"
        // Chevaux des captures d'écran précédentes
        "CORTEZ BANK H.PS. 6 A.": "CORTEZ BANK (GB)",
        "CORTEZ BANK H.P.S. 6 A.": "CORTEZ BANK (GB)",
        "CORTEZ BANK": "CORTEZ BANK (GB)",
        "LEHMAN (GB) M.PS. 6 A.": "LEHMAN (GB)",
        "LEHMAN M.PS. 6 A.": "LEHMAN (GB)",
        "LEHMAN H.PS. 6 A.": "LEHMAN (GB)",
        "BENI KHIAR M.PS. 7 A.": "BENI KHIAR",
        "RONNIE ROCKET H.PS. 5 A.": "RONNIE ROCKET",
        "LADY MADININA F.PS. 5 A.": "LADY MADININA",
        "DADIDOM H.PS. 7 A.": "DADIDOM",
        
        // Nouveaux chevaux des captures d'écran récentes
        "BAK'S WOOD H.PS. 4 A.": "BAK'S WOOD",
        "BAK S WOOD H.PS. 4 A.": "BAK'S WOOD",
        "BAKS WOOD H.PS. 4 A.": "BAK'S WOOD",
        "MISS ESTRELLA F.PS. 5 A.": "MISS ESTRELLA",
        "NUIT CHOPE F.PS. 4 A.": "NUIT CHOPE",
        "ALITA F.PS. 5 A.": "ALITA",
        "BEL TI BOUG H.PS. 6 A.": "BEL TI BOUG",
        
        // Nouveaux cas spéciaux pour propriétaires/éleveurs avec initiales
        "S.STEMPNIAK": "ECURIES SERGE STEMPNIAK",
        "S. STEMPNIAK": "ECURIES SERGE STEMPNIAK",
        "G.AUGU": "GERARD AUGUSTIN-NORMAND", // Nouveau: correspondance pour G.AUGU
        "G. AUGU": "GERARD AUGUSTIN-NORMAND", // Nouveau: avec espace
        "JP. CAYROUZE": "MR JEAN-PAUL CAYROUZE",
        "JP.CAYROUZE": "MR JEAN-PAUL CAYROUZE",
        "J.P. CAYROUZE": "MR JEAN-PAUL CAYROUZE",
        "HATIM H.PS. 4 a.": "HATIM",
        "MAT. DAGUZAN-GARROS": "MR MATHIEU DAGUZAN-GARROS",
        
        // Nouvelles entrées pour les propriétaires/éleveurs des captures d'écran
        "ECURIE JEAN-LOUIS BO...": "ECURIE JEAN-LOUIS BOUCHARD",
        "ECURIE JEAN-LOUIS BO": "ECURIE JEAN-LOUIS BOUCHARD",
        "E. LEMAITRE": "MME LISA LEMIERE DUBOIS",
        "E.LEMAITRE": "MME LISA LEMIERE DUBOIS",
        "SUC. S.A. AGA KHAN": "SUCCESSION AGA KHAN",
        "SUC.S.A. AGA KHAN": "SUCCESSION AGA KHAN",
        "SUC S.A. AGA KHAN": "SUCCESSION AGA KHAN",
        "PAT. CHEDEVILLE": "PATRICK CHEDEVILLE",
        "PAT.CHEDEVILLE": "PATRICK CHEDEVILLE",
        "PAT CHEDEVILLE": "PATRICK CHEDEVILLE",
        "MME K. MORICE": "MME KARINE MORICE",
        "MME K.MORICE": "MME KARINE MORICE",
        "JPJ. DUBOIS": "MR JEAN-PIERRE-JOSEPH DUBOIS",
        "JPJ.DUBOIS": "MR JEAN-PIERRE-JOSEPH DUBOIS",
        "T.DE LA HERONNIERE": "THIERRY DE LA HERONNIERE",
        "T. DE LA HERONNIERE": "THIERRY DE LA HERONNIERE",
        "ECURIE ARTU SNC": "ECURIE ARTU",
        "D. BOUQ...": "DOMINIQUE BOUQUETOT"
    },
    
    // Configuration des poids selon différents facteurs contextuels
    TYPE_WEIGHTS: {
        "plat": { cheval: 0.55, jockey: 0.15, entraineur: 0.12, eleveur: 0.10, proprietaire: 0.08 },
        "obstacle": { cheval: 0.45, jockey: 0.25, entraineur: 0.15, eleveur: 0.08, proprietaire: 0.07 },
        "default": { cheval: 0.55, jockey: 0.15, entraineur: 0.12, eleveur: 0.10, proprietaire: 0.08 }
    },

    DIST_WEIGHTS: {
        "sprint": { cheval: 0.50, jockey: 0.20, entraineur: 0.15, eleveur: 0.08, proprietaire: 0.07 },
        "mile": { cheval: 0.55, jockey: 0.15, entraineur: 0.12, eleveur: 0.10, proprietaire: 0.08 },
        "middle": { cheval: 0.58, jockey: 0.12, entraineur: 0.12, eleveur: 0.10, proprietaire: 0.08 },
        "staying": { cheval: 0.60, jockey: 0.10, entraineur: 0.10, eleveur: 0.12, proprietaire: 0.08 }
    },

    FIELD_SIZE_WEIGHTS: {
        "small": { cheval: 0.50, jockey: 0.20, entraineur: 0.15, eleveur: 0.08, proprietaire: 0.07 },
        "medium": { cheval: 0.55, jockey: 0.15, entraineur: 0.12, eleveur: 0.10, proprietaire: 0.08 },
        "large": { cheval: 0.60, jockey: 0.10, entraineur: 0.10, eleveur: 0.12, proprietaire: 0.08 }
    },

    POSITION_WEIGHTS: {
        "first": { cheval: 0.53, jockey: 0.17, entraineur: 0.12, eleveur: 0.10, proprietaire: 0.08 },
        "middle": { cheval: 0.55, jockey: 0.15, entraineur: 0.12, eleveur: 0.10, proprietaire: 0.08 },
        "last": { cheval: 0.57, jockey: 0.13, entraineur: 0.12, eleveur: 0.10, proprietaire: 0.08 }
    },
    
    // NOUVEAU: Configuration des poids pour le facteur poids porté
    WEIGHT_ADJUSTMENTS: {
        "heavy_minus": { adjustment: 0.02 },  // Pour -2kg ou plus
        "light_minus": { adjustment: 0.01 },  // Pour -1kg à -2kg
        "neutral": { adjustment: 0.00 },      // Pour poids neutres (-1kg à +1kg)
        "light_plus": { adjustment: -0.01 },  // Pour +1kg à +2kg
        "heavy_plus": { adjustment: -0.02 },  // Pour +2kg ou plus
    },
    
    // NOUVEAU: Multiplicateurs d'impact du poids selon la distance
    WEIGHT_DISTANCE_MULTIPLIERS: {
        "sprint": 0.7,   // Impact réduit pour les sprints (<1400m)
        "mile": 1.0,     // Impact standard pour mile (1400-1900m)
        "middle": 1.0,   // Impact standard pour moyenne distance (1900-2400m)
        "staying": 1.3,  // Impact accentué pour longue distance (>2400m)
    },

    // NOUVEAU: Configuration des poids pour la corde
    CORDE_WEIGHTS: {
        // Pour les pistes en ligne droite
        "ligne_droite": {
            "interieur": 0.02,    // Cordes 1-3
            "milieu": 0.00,       // Cordes 4-10 (neutre)
            "exterieur": -0.01    // Cordes 11+
        },
        // Pour les pistes avec virages
        "virage": {
            "interieur": 0.03,    // Cordes 1-3 (avantage plus important)
            "milieu": 0.00,       // Cordes 4-8 (neutre)
            "exterieur": -0.02    // Cordes 9+
        }
    },

    // Fonctions helper pour déterminer les buckets
    getDistanceBucket: function(distance) {
        if (!distance || isNaN(distance)) return "mile";
        
        if (distance < 1400) return "sprint";
        if (distance < 1900) return "mile";
        if (distance < 2400) return "middle";
        return "staying";
    },

    getFieldSizeBucket: function(participants) {
        const count = Array.isArray(participants) ? participants.length : 0;
        
        if (count < 9) return "small";
        if (count < 14) return "medium";
        return "large";
    },

    getPositionBucket: function(position, total) {
        if (!position || !total || position > total) return "middle";
        
        if (position <= Math.ceil(total * 0.3)) return "first";
        if (position >= Math.floor(total * 0.7)) return "last";
        return "middle";
    },
    
    // NOUVEAU: Fonction pour déterminer la catégorie de corde
    getCordeBucket: function(cordeNum, typePiste = "virage") {
        if (!cordeNum || isNaN(parseInt(cordeNum))) return "milieu";
        
        const corde = parseInt(cordeNum);
        
        if (typePiste === "ligne_droite") {
            if (corde <= 3) return "interieur";
            if (corde <= 10) return "milieu";
            return "exterieur";
        } else { // virage par défaut
            if (corde <= 3) return "interieur";
            if (corde <= 8) return "milieu";
            return "exterieur";
        }
    },
    
    // NOUVEAU: Fonction pour déterminer le type de piste en fonction de l'hippodrome et de la distance
    getTypePiste: function(hippodrome, distance) {
        // Hippodromes connus pour être en ligne droite
        const hippodromesLigneDroite = [
            "CHANTILLY", "DEAUVILLE", "MAISONS-LAFFITTE",
            "STRAIGHT COURSE", "LIGNE DROITE"
        ];
        
        // Vérifier si l'hippodrome est en ligne droite
        if (hippodrome && hippodromesLigneDroite.some(h => 
            hippodrome.toUpperCase().includes(h))) {
            return "ligne_droite";
        }
        
        // Par défaut, utiliser la distance comme critère
        // Les courses courtes sont plus susceptibles d'être en ligne droite
        if (distance && distance < 1200) {
            return "ligne_droite";
        }
        
        // Par défaut, on suppose que c'est une piste avec virages
        return "virage";
    },
    
    // NOUVEAU: Fonction pour déterminer la catégorie de poids
    getWeightBucket: function(weight, averageWeight) {
        if (!weight || !averageWeight) return "neutral";
        
        const diff = weight - averageWeight;
        
        if (diff <= -2) return "heavy_minus";
        if (diff <= -1) return "light_minus";
        if (diff >= 2) return "heavy_plus";
        if (diff >= 1) return "light_plus";
        return "neutral";
    },
    
    // NOUVEAU: Fonction pour calculer le poids moyen du peloton
    calculateAverageWeight: function(participants) {
        if (!participants || !Array.isArray(participants) || participants.length === 0) {
            return null;
        }
        
        // Filtrer les participants qui ont un poids spécifié
        const participantsWithWeight = participants.filter(p => p.poids && !isNaN(parseInt(p.poids)));
        
        if (participantsWithWeight.length === 0) {
            return null;
        }
        
        // Calculer la somme des poids
        const weightSum = participantsWithWeight.reduce((sum, p) => {
            // Extraire le nombre du format potentiel "xx kg" ou similaire
            const weightMatch = String(p.poids).match(/(\d+)/);
            const weight = weightMatch ? parseInt(weightMatch[1]) : 0;
            return sum + weight;
        }, 0);
        
        // Retourner la moyenne arrondie à l'entier le plus proche
        return Math.round(weightSum / participantsWithWeight.length);
    },
    
    // NOUVEAU: Fonction pour extraire la valeur numérique du poids
    extractWeight: function(weightStr) {
        if (!weightStr) return null;
        
        // Convertir en chaîne au cas où
        const str = String(weightStr);
        
        // Extraire les nombres de formats comme "54 kg", "54kg", "54"
        const weightMatch = str.match(/(\d+)/);
        if (weightMatch) {
            return parseInt(weightMatch[1]);
        }
        
        return null;
    },

    // NOUVEAU: Fonction pour extraire le numéro de corde d'un texte
    extraireNumeroCorde: function(cordeTexte) {
        if (!cordeTexte) return null;
        
        // Utiliser une expression régulière pour extraire uniquement les chiffres
        const match = cordeTexte.match(/\d+/);
        return match ? match[0] : null;
    },

    // Fonction principale pour calculer les poids dynamiques
    getWeights: function(course) {
        // Poids par défaut (mis à jour pour inclure le poids porté et la corde)
        const defaultWeights = { 
            cheval: 0.40, 
            jockey: 0.20, 
            entraineur: 0.15, 
            eleveur: 0.10, 
            proprietaire: 0.10, 
            poids_porte: 0.03, 
            corde: 0.02
        };
        
        if (!course) return defaultWeights;
        
        // Récupérer le type de course (plat/obstacle)
        const type = (course.type || 'plat').toLowerCase();
        const tw = this.TYPE_WEIGHTS[type] || this.TYPE_WEIGHTS.default;
        
        // Poids par distance
        const distanceBucket = this.getDistanceBucket(course.distance);
        const dw = this.DIST_WEIGHTS[distanceBucket];
        
        // Poids par taille du peloton
        const fieldSizeBucket = this.getFieldSizeBucket(course.participants);
        const sw = this.FIELD_SIZE_WEIGHTS[fieldSizeBucket];
        
        // Poids par position dans la journée
        const positionBucket = this.getPositionBucket(course.position, course.totalRacesInDay);
        const pw = this.POSITION_WEIGHTS[positionBucket];
        
        // Log pour débogage
        console.log(`Contexte course: distance=${course.distance}m (${distanceBucket}), participants=${course.participants?.length || 0} (${fieldSizeBucket}), position=${course.position}/${course.totalRacesInDay} (${positionBucket})`);
        
        // Fusion des poids avec priorités MODIFIÉES: 
        // Distance (36%) + Taille (27%) + Position (18%) + Type (9%) + Poids porté (10%) + Corde (5%)
        const result = {};
        const keys = ['cheval', 'jockey', 'entraineur', 'eleveur', 'proprietaire'];
        
        keys.forEach(k => {
            // Calculer la moyenne pondérée avec les nouveaux coefficients
            result[k] = (dw[k] * 0.36) + (sw[k] * 0.27) + (pw[k] * 0.18) + (tw[k] * 0.09);
            // SUPPRIMÉ: result[k] = result[k] * 0.85;
            // Ne PAS arrondir ici, on le fera après la normalisation
        });

        // Ajouter le poids porté comme facteur
        result.poids_porte = 0.10;

        // Ajouter la corde comme nouveau facteur (5%)
        result.corde = 0.05;

        // NOUVEAU: Normaliser pour que la somme = 1.000
        const total = Object.values(result).reduce((sum, w) => sum + w, 0);
        Object.keys(result).forEach(key => {
            result[key] = result[key] / total;
            // Arrondir à 3 décimales APRÈS la normalisation
            result[key] = Math.round(result[key] * 1000) / 1000;
        });

        // OPTIONNEL: Vérification en mode debug
        if (this.debug) {
            const finalSum = Object.values(result).reduce((sum, w) => sum + w, 0);
            console.log('🔍 Poids finaux:', {
                poids: result,
                somme: finalSum.toFixed(6),
                check: Math.abs(finalSum - 1) < 0.001 ? '✅' : '❌'
            });
        }

        return result;
    },
    
    // Algorithme de distance de Levenshtein pour mesurer la similarité entre deux chaînes
    levenshteinDistance(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        
        const matrix = [];
        
        // Initialiser la matrice
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        
        // Remplir la matrice
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i-1) === a.charAt(j-1)) {
                    matrix[i][j] = matrix[i-1][j-1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i-1][j-1] + 1, // substitution
                        matrix[i][j-1] + 1,   // insertion
                        matrix[i-1][j] + 1    // suppression
                    );
                }
            }
        }
        
        return matrix[b.length][a.length];
    },
    
    // Extraire le nom principal (nom de famille) d'une chaîne
    extractMainName(name) {
        if (!name) return "";
        
        // Nettoyer la chaîne
        let clean = name.toUpperCase()
            .replace(/^(MR|MME|MLLE|M|SUC\.)\\s+/i, '')
            .replace(/^([A-Z]+)\\.?\\s+/i, '') // Supprimer les initiales
            .trim();
            
        // Diviser en mots et prendre le dernier pour le nom de famille
        // Mais tenir compte des noms composés avec tirets ou particules
        const parts = clean.split(/\\s+/);
        
        if (parts.length > 1) {
            // Vérifier les cas spéciaux
            if (parts.some(p => p.match(/^(DE|DU|DES|LA|LE)$/i))) {
                // S'il y a une particule, prendre tout après le premier mot (qui est souvent un prénom)
                return parts.slice(1).join(' ');
            } else if (parts[parts.length - 1].includes('-')) {
                // Pour les noms comme "TALHOUET-ROY", prendre la première partie avant le tiret
                const hyphenParts = parts[parts.length - 1].split('-');
                return hyphenParts[0];
            } else {
                // Sinon, prendre le dernier mot comme nom de famille
                return parts[parts.length - 1];
            }
        }
        
        return clean;
    },
    
    // Fonction pour trouver le meilleur match flou
    findBestFuzzyMatch(input, candidates, categorie, threshold = 0.58) { // Seuil abaissé pour plus de résultats
        if (!input || !candidates || candidates.length === 0) return null;
        
        // Nettoyer l'entrée et gérer les noms tronqués
        let cleanInput = input.toUpperCase().trim();
        cleanInput = cleanInput.replace(/\\s*\\.\\.\\.$/g, ""); // supprimer les ellipses en fin de chaîne
        
        // Gérer les noms tronqués (se terminant par ...) ou abrégés (comme "BO...")
        if (cleanInput.includes('...')) {
            const basePart = cleanInput.split('...')[0].trim();
            console.log(`🔍 Nom tronqué détecté: "${input}" -> base: "${basePart}"`);
            
            // Rechercher des candidats dont le début correspond à cette base
            for (const candidate of candidates) {
                const candidateName = (candidate.Nom || candidate.NomPostal || "").toUpperCase();
                if (candidateName.startsWith(basePart)) {
                    console.log(`✅ Correspondance pour nom tronqué: "${candidateName}"`);
                    return {
                        score: 0,
                        rang: candidate.Rang,
                        similarite: 95,
                        nomTrouve: candidate.Nom || candidate.NomPostal,
                        item: candidate
                    };
                }
            }
        }
        
        // Extraire le nom principal (probablement le nom de famille)
        const mainName = this.extractMainName(cleanInput);
        
        console.log(`🔍 Fuzzy matching pour "${cleanInput}" - nom principal: "${mainName}"`);
        
        let bestMatch = null;
        let bestScore = 0;
        let bestSimilarity = 0;
        
        // Préfiltrer les candidats qui contiennent au moins partiellement le nom principal
        // pour éviter de calculer la distance sur tous les candidats (optimisation)
        let relevantCandidates = candidates;
        
        if (mainName.length > 2) {
            relevantCandidates = candidates.filter(candidate => {
                const candidateName = (candidate.Nom || candidate.NomPostal || "").toUpperCase();
                return candidateName.includes(mainName.substring(0, Math.min(mainName.length, 3)));
            });
            
            console.log(`Candidats préfiltrés: ${relevantCandidates.length} (sur ${candidates.length})`);
            
            // Si aucun candidat pertinent après préfiltrage, utiliser tous les candidats
            if (relevantCandidates.length === 0) {
                relevantCandidates = candidates;
            }
        }
        
        // Pour les éleveurs et propriétaires: donner plus d'importance aux haras/écuries 
        // si le nom d'entrée commence par ces mots
        const isOrganization = cleanInput.startsWith('ECURIE') || 
                               cleanInput.startsWith('HARAS') || 
                               cleanInput.startsWith('STUD') ||
                               cleanInput.startsWith('ELEVAGE');
                               
        // Parcourir tous les candidats pertinents
        relevantCandidates.forEach(candidate => {
            const candidateName = (candidate.Nom || candidate.NomPostal || "").toUpperCase();
            const candidateMainName = this.extractMainName(candidateName);
            
            // Calculer la similarité primaire avec les noms principaux
            const mainNameMaxLength = Math.max(mainName.length, candidateMainName.length);
            const mainNameDistance = this.levenshteinDistance(mainName, candidateMainName);
            const mainNameSimilarity = mainNameMaxLength > 0 ? 
                                      (mainNameMaxLength - mainNameDistance) / mainNameMaxLength : 0;
            
            // Calculer la similarité globale
            const maxLength = Math.max(cleanInput.length, candidateName.length);
            const distance = this.levenshteinDistance(cleanInput, candidateName);
            const similarity = maxLength > 0 ? (maxLength - distance) / maxLength : 0;
            
            // Score combiné
            let score = (mainNameSimilarity * 0.7) + (similarity * 0.3);
            
            // Bonus pour les correspondances exactes du nom principal
            if (candidateMainName === mainName) {
                score += 0.2;
            }
            
            // Vérifier si le nom principal est contenu dans le nom du candidat
            if (candidateName.includes(mainName) && mainName.length > 2) {
                score += 0.15;
                console.log(`Bonus inclusion: ${candidateName} contient ${mainName}`);
            }
            
            // Vérifier les débuts de noms (particulièrement utile pour les noms tronqués)
            if (cleanInput.length > 3 && candidateName.startsWith(cleanInput.substring(0, cleanInput.length - 1))) {
                score += 0.15;
                console.log(`Bonus préfixe: ${candidateName} commence par ${cleanInput.substring(0, cleanInput.length - 1)}`);
            }
            
            // Bonus/malus pour les organisations
            if (isOrganization) {
                if (candidateName.startsWith('ECURIE') || 
                    candidateName.startsWith('HARAS') || 
                    candidateName.startsWith('STUD') ||
                    candidateName.startsWith('ELEVAGE')) {
                    score += 0.15; // Bonus pour org-to-org match
                } else {
                    score -= 0.1; // Malus pour org-to-person mismatch
                }
            }
            
            // Traitement spécial pour les successions (SUC.)
            if (cleanInput.startsWith('SUC.') || cleanInput.startsWith('SUC ')) {
                if (candidateName.includes('SUCCESSION') || candidateName.includes('SUC.')) {
                    score += 0.2; // Bonus important pour les successions
                }
            }
            
            // Traitement des abréviations comme "PAT." pour "PATRICK"
            if (cleanInput.match(/^([A-Z]{2,3})\\./) ) {
                const abrev = RegExp.$1;
                if (candidateName.startsWith(abrev)) {
                    score += 0.15;
                    console.log(`Bonus abréviation: ${abrev} -> ${candidateName}`);
                }
            }
            
            // Threshold minimum
            if (score > bestScore && score >= threshold) {
                bestScore = score;
                bestSimilarity = similarity;
                bestMatch = candidate;
            }
        });
        
        if (bestMatch) {
            console.log(`✅ Meilleur match fuzzy: "${bestMatch.Nom || bestMatch.NomPostal}" (score: ${bestScore.toFixed(2)}, similarité: ${bestSimilarity.toFixed(2)})`);
            return {
                score: 0, // Score 0 pour la compatibilité avec le système existant
                rang: bestMatch.Rang,
                similarite: bestScore * 100,
                nomTrouve: bestMatch.Nom || bestMatch.NomPostal,
                item: bestMatch
            };
        }
        
        console.log(`❌ Aucun match fuzzy trouvé pour "${cleanInput}" (seuil: ${threshold})`);
        return null;
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
            
            // Si on arrive ici, créer un ensemble de données vide mais valide
            console.warn(`Aucune donnée valide trouvée pour ${category}, utilisation d'un ensemble vide`);
            this.data[category] = [];
            this.calculateCategoryStats(category, []);
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
    
    // Nouvelle fonction pour extraire le nom de base d'un cheval
    extraireNomBaseCheval(nom) {
        if (!nom) return "";
        
        // Supprimer les suffixes H.PS, F.PS, M.PS avec leur âge
      const regex = /^(.+?)(?:\s+[HFM]\.?P\.?S\.?\s+\d+\s*a\.?.*)?$/i;
        const match = nom.match(regex);
        
        if (match) {
            return match[1].trim();
        }
        
        return nom;
    },
    
    // Fonction pour nettoyer les noms tronqués avec "..."
    nettoyerNomTronque(nom) {
        if (!nom) return "";
        
        // Nettoyer les ellipses en fin de chaîne
        return nom.replace(/\\s*\\.\\.\\.$/g, "").trim();
    },
    
    // Fonction pour normaliser un nom avec apostrophe
    normaliserNomAvecApostrophe(nom) {
        if (!nom) return "";
        
        // Standardiser les apostrophes (remplacer par apostrophe simple)
        let nomStandard = nom.replace(/['´`']/g, "'");
        
        // Supprimer les accents
        nomStandard = nomStandard.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
        
        // Standardiser les ligatures
        nomStandard = nomStandard.replace(/[œŒ]/g, 'oe');
        
        // Si BAK S WOOD, transformer en BAK'S WOOD
        nomStandard = nomStandard.replace(/\\bBAK\\s+S\\s+WOOD\\b/i, "BAK'S WOOD");
        
        // Si BAKS WOOD, transformer en BAK'S WOOD
        nomStandard = nomStandard.replace(/\\bBAKS\\s+WOOD\\b/i, "BAK'S WOOD");
        
        // Plus génériquement, détecter les cas comme "X S Y" -> "X'S Y"
        nomStandard = nomStandard.replace(/\\b(\\w+)\\s+S\\s+(\\w+)\\b/i, "$1'S $2");
        
        return nomStandard;
    },
    
    // Fonction pour normaliser et nettoyer un nom (améliorée pour les chevaux et écuries)
    normaliserNom(nom) {
        if (!nom) return "";
        
        // Nettoyer les noms tronqués (avec ...)
        nom = this.nettoyerNomTronque(nom);
        
        // Appliquer les corrections pour les apostrophes
        nom = this.normaliserNomAvecApostrophe(nom);
        
        // Vérifier d'abord la table de correspondance manuelle
        const nomUpper = nom.toUpperCase().trim();
        if (this.correspondanceManuelle[nomUpper]) {
            console.log(`Correspondance manuelle trouvée: "${nomUpper}" -> "${this.correspondanceManuelle[nomUpper]}"`);
            return this.correspondanceManuelle[nomUpper];
        }
        
        // Vérifier aussi les correspondances découvertes
        if (this.correspondancesDecouvertes[nomUpper]) {
            console.log(`Correspondance découverte précédemment: "${nomUpper}" -> "${this.correspondancesDecouvertes[nomUpper]}"`);
            return this.correspondancesDecouvertes[nomUpper];
        }
        
        // Convertir en majuscules et supprimer les espaces superflus
        let nomNormalise = nomUpper;
        
        // AMÉLIORATION: Expression régulière pour supprimer les suffixes des chevaux
        // Supprimer d'abord les suffixes H.PS., F.PS., M.PS. avec âge
        const matchSuffixeCheval = nomNormalise.match(/^([\p{L}\s'-]+?)(\s+[HFM]\.?P\.?S\.?.*$)/ui);
        if (matchSuffixeCheval) {
            nomNormalise = matchSuffixeCheval[1].trim();
            console.log(`Nom cheval normalisé (suffixe supprimé): "${nom}" -> "${nomNormalise}"`);
        } else {
            // Si pas de suffixe, utiliser l'ancienne méthode pour l'origine (GB), etc.
            const matchCheval = nomNormalise.match(/^([\p{L}\s'-]+?)(\s*\(([\p{L}]+)\))?(\s+[HFM]\.?P\.?S\.?.*)?$/ui);
            
            if (matchCheval) {
                const nomBase = matchCheval[1].trim();
                const origine = matchCheval[3] ? `(${matchCheval[3].trim()})` : "";
                
                // Reconstruire le nom standardisé
                nomNormalise = nomBase + (origine ? ` ${origine}` : "");
                console.log(`Nom cheval normalisé (avec origine): "${nom}" -> "${nomNormalise}"`);
            }
        }
        
        // Standardiser les préfixes pour personnes
        nomNormalise = nomNormalise.replace(/^M\\.\\s*/i, "MR ")
                                .replace(/^MME\\.\\s*/i, "MME ")
                                .replace(/^MLLE\\.\\s*/i, "MLLE ");
        
        // Standardiser les préfixes pour écuries (EC, ECURIE, ECURIES)
        nomNormalise = nomNormalise.replace(/^EC\\./i, "ECURIE ")
                                .replace(/^EC\\s+/i, "ECURIE ")
                                .replace(/^ECURIES\\s+/i, "ECURIE ");
        
        return nomNormalise;
    },
    
    // Fonction de segmentation des noms composés
    segmenterNom(nom) {
        if (!nom) return {};
        
        const mots = nom.split(/\\s+/);
        const segments = {
            prefixe: null,
            prenom: null,
            particule: null,
            nomFamille: null
        };
        
        // Détecter les préfixes (M., MME, etc.)
        if (mots[0].match(/^(M|MR|MME|MLLE)\\.?$/i)) {
            segments.prefixe = mots.shift();
        }
        
        // Si le nom a au moins 2 mots après le préfixe
        if (mots.length >= 2) {
            segments.prenom = mots[0];
            
            // Détecter les particules (DE, DU, etc.)
            if (mots[1].match(/^(DE|DU|DES|LA|LE)$/i)) {
                segments.particule = mots[1];
                segments.nomFamille = mots.slice(2).join(' ');
            } else {
                segments.nomFamille = mots.slice(1).join(' ');
            }
        } else if (mots.length === 1) {
            segments.nomFamille = mots[0];
        }
        
        return segments;
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

    // NOUVELLE FONCTION: Chercher un éleveur/personne avec initiale de prénom
    chercherPersonneAvecInitiale(nomAvecInitiale, donneesClassement) {
        // Capture les formats comme "MAT. DURAND", "M. DURAND", "JPJ. DUBOIS", "AT. AL-MEHSHADI"
        const match = nomAvecInitiale.match(/^([A-Z]+)\\.?\\s*(.+?)(?:\\s+\\([^)]+\\))?$/i);
        if (!match) return null;

        const initialePrenom = match[1].toUpperCase(); // ex: MAT, AT
        const nomFamille = match[2].toUpperCase();     // ex: DURAND, AL-MEHSHADI

        console.log(`🔎 Recherche personne: initiale="${initialePrenom}" et nom="${nomFamille}"`);

        // Filtrer les candidats potentiels par nom de famille
        const candidats = donneesClassement.filter(entry => {
            const nomComplet = (entry.Nom || entry.NomPostal || "").toUpperCase();
            
            // Pour les noms composés comme "AL-MEHSHADI"
            if (nomFamille.includes('-')) {
                const partiesNom = nomFamille.split('-');
                // Si toutes les parties du nom sont incluses dans le nom complet
                return partiesNom.every(partie => nomComplet.includes(partie));
            }
            
            return nomComplet.includes(nomFamille);
        });

        if (candidats.length === 0) {
            console.log(`⚠️ Aucune personne trouvée avec le nom "${nomFamille}"`);
            return null;
        }

        console.log(`📊 ${candidats.length} personnes potentielles trouvées avec le nom "${nomFamille}"`);

        // Cas spécial pour les haras et écuries
        const candidatsOrganisation = candidats.filter(entry => {
            const nomComplet = (entry.Nom || entry.NomPostal || "").toUpperCase();
            return nomComplet.includes("HARAS") || nomComplet.includes("ELEVAGE") || 
                nomComplet.includes("STUD") || nomComplet.includes("BREEDING") ||
                nomComplet.includes("ECURIE");
        });
        
        // Si on a des organisations dans les candidats et que ce n'est pas une personne, privilégier les organisations
        if (candidatsOrganisation.length > 0 && !nomAvecInitiale.toUpperCase().includes("MR") && 
            !nomAvecInitiale.toUpperCase().includes("MME")) {
            // Trier par rang et prendre le meilleur
            const meilleure = candidatsOrganisation.sort((a, b) => 
                parseInt(a.Rang || 999) - parseInt(b.Rang || 999))[0];
            
            console.log(`✅ Organisation trouvée: "${meilleure.Nom || meilleure.NomPostal}"`);
            return {
                score: 0,
                rang: meilleure.Rang,
                nomTrouve: meilleure.Nom || meilleure.NomPostal,
                item: meilleure
            };
        }

        // Parmi les candidats, trouver celui dont le prénom commence par l'initiale
        for (const candidat of candidats) {
            const nomComplet = (candidat.Nom || candidat.NomPostal || "").toUpperCase();
            
            // Extraire le prénom - cas complexe avec différents formats possibles
            const mots = nomComplet.split(/\\s+/);
            let prenom = "";
            
            // Traiter les cas où le premier élément est MR, MME, M., etc.
            let startIndex = 0;
            if (mots[0] === "MR" || mots[0] === "MME" || mots[0] === "MLLE" || mots[0] === "M") {
                startIndex = 1;
            }
            
            // Vérifier s'il reste des mots pour le prénom
            if (mots.length <= startIndex) continue;
            
            // Prendre le prénom (potentiellement composé)
            prenom = mots[startIndex];
            
            // Si c'est un prénom composé (avec tiret)
            if (prenom.includes('-')) {
                // Pour les noms arabes comme "AL-MEHSHADI", considérer le nom complet
                if (prenom.startsWith("AL-")) {
                    prenom = prenom;
                } else {
                    // Sinon prendre la première partie pour l'initiale
                    prenom = prenom.split('-')[0];
                }
            }
            
            // Vérifier si le prénom commence par l'initiale
            if (prenom.startsWith(initialePrenom)) {
                console.log(`✅ Personne trouvée: "${nomComplet}" (prénom "${prenom}" commence par "${initialePrenom}")`);
                return {
                    score: 0,
                    rang: candidat.Rang,
                    nomTrouve: nomComplet,
                    item: candidat
                };
            }
        }

        // Si on n'a pas trouvé par prénom, prendre le meilleur rang
        if (candidats.length > 0) {
            const meilleurCandidat = candidats.sort((a, b) => 
                parseInt(a.Rang || 999) - parseInt(b.Rang || 999))[0];
            
            console.log(`⚠️ Aucune personne avec prénom correspondant trouvé, utilisation du meilleur rang: "${meilleurCandidat.Nom || meilleurCandidat.NomPostal}"`);
            return {
                score: 0,
                rang: meilleurCandidat.Rang,
                nomTrouve: meilleurCandidat.Nom || meilleurCandidat.NomPostal,
                item: meilleurCandidat
            };
        }

        return null;
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
        
        // Normaliser le nom avec l'initiale et nettoyer les ellipses
        const nomNormalise = this.normaliserNom(nomAvecInitiale);
        
        // Vérifier d'abord la table de correspondance manuelle
        const nomUpper = nomAvecInitiale.toUpperCase().trim();
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
        
        // Vérifier aussi dans les correspondances découvertes
        if (this.correspondancesDecouvertes[nomUpper]) {
            const nomCorrespondance = this.correspondancesDecouvertes[nomUpper];
            console.log(`Correspondance découverte précédemment: "${nomUpper}" -> "${nomCorrespondance}"`);
            
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
        
        // *** NOUVEAU CODE POUR STEMPNIAK ***
        // Cas spécifique pour S.STEMPNIAK -> ECURIES SERGE STEMPNIAK
        if (nomAvecInitiale.match(/^S\\.STEMPNIAK$/i) || nomAvecInitiale.match(/^S\\s*STEMPNIAK$/i)) {
            console.log("Cas spécial détecté: S.STEMPNIAK -> ECURIES SERGE STEMPNIAK");
            
            // Rechercher spécifiquement STEMPNIAK dans les données
            const correspondancesEcurie = donneesClassement.filter(item => {
                const nomItem = (item.Nom || item.NomPostal || "").toUpperCase();
                return nomItem.includes('STEMPNIAK');
            });
            
            if (correspondancesEcurie.length > 0) {
                // Trier par rang pour prendre le meilleur
                const meilleure = correspondancesEcurie.reduce((best, current) => {
                    const rangCurrent = parseInt(current.Rang) || 999;
                    const rangBest = parseInt(best.Rang) || 999;
                    return rangCurrent < rangBest ? current : best;
                }, correspondancesEcurie[0]);
                
                console.log(`Correspondance écurie spéciale trouvée: ${meilleure.Nom || meilleure.NomPostal}`);
                return {
                    score: 0,
                    rang: meilleure.Rang,
                    nomTrouve: meilleure.Nom || meilleure.NomPostal,
                    item: meilleure
                };
            }
        }
        
        // *** NOUVEAU POUR G.AUGU -> GERARD AUGUSTIN-NORMAND ***
        if (nomAvecInitiale.match(/^G\\.AUGU/i) || nomAvecInitiale.match(/^G\\s*AUGU/i)) {
            console.log("Cas spécial détecté: G.AUGU -> GERARD AUGUSTIN-NORMAND");
            
            // Rechercher spécifiquement AUGUSTIN-NORMAND dans les données
            const correspondancesPersonne = donneesClassement.filter(item => {
                const nomItem = (item.Nom || item.NomPostal || "").toUpperCase();
                return nomItem.includes('AUGUSTIN') || nomItem.includes('NORMAND');
            });
            
            if (correspondancesPersonne.length > 0) {
                // Trier par rang pour prendre le meilleur
                const meilleure = correspondancesPersonne.reduce((best, current) => {
                    const rangCurrent = parseInt(current.Rang) || 999;
                    const rangBest = parseInt(best.Rang) || 999;
                    return rangCurrent < rangBest ? current : best;
                }, correspondancesPersonne[0]);
                
                console.log(`Correspondance spéciale G.AUGU trouvée: ${meilleure.Nom || meilleure.NomPostal}`);
                return {
                    score: 0,
                    rang: meilleure.Rang,
                    nomTrouve: meilleure.Nom || meilleure.NomPostal,
                    item: meilleure
                };
            }
        }
        
        // NOUVELLE FONCTIONNALITÉ: détection automatique des abréviations de prénom
        // Vérifier si le format correspond à une abréviation de prénom: "MAT. DAGUZAN-GARROS"
        if (nomAvecInitiale.match(/^[A-Z]+\\.\\s*.+$/i)) {
            const resultatInitiale = this.chercherPersonneAvecInitiale(nomAvecInitiale, donneesClassement);
            if (resultatInitiale) {
                // Mémoriser cette correspondance pour les recherches futures
                this.correspondancesDecouvertes[nomAvecInitiale.toUpperCase().trim()] = resultatInitiale.nomTrouve;
                console.log(`🏆 Correspondance par initiale trouvée: "${nomAvecInitiale}" → "${resultatInitiale.nomTrouve}"`);
                return resultatInitiale;
            }
        }
        
        // NOUVELLE FONCTIONNALITÉ: fuzzy matching pour les propriétaires et éleveurs
        // Application du fuzzy matching avec un seuil de 0.58 (58% de similarité) - abaissé pour plus de résultats
        const fuzzyResult = this.findBestFuzzyMatch(nomAvecInitiale, donneesClassement, categorie, 0.58);
        if (fuzzyResult) {
            console.log(`🧩 Correspondance par fuzzy matching trouvée: "${nomAvecInitiale}" → "${fuzzyResult.nomTrouve}" (similarité: ${fuzzyResult.similarite.toFixed(1)}%)`);
            
            // Mémoriser cette correspondance pour les recherches futures
            this.correspondancesDecouvertes[nomAvecInitiale.toUpperCase().trim()] = fuzzyResult.nomTrouve;
            
            return fuzzyResult;
        }
        
        // Vérifier si c'est une écurie avec préfixe EC. ou ECURIE/ECURIES
        if (nomNormalise.startsWith('ECURIE') || nomAvecInitiale.toUpperCase().startsWith('EC.')) {
            // Recherche d'écurie - traitement spécial
            const nomEcurie = nomNormalise.replace(/^ECURIE\\s+/i, '').trim();
            
            console.log(`Recherche d'écurie pour: "${nomEcurie}"`);
            
            // Chercher les correspondances avec les écuries
            const correspondances = donneesClassement.filter(item => {
                const nomItem = this.normaliserNom(item.Nom || item.NomPostal || "");
                
                // Vérifier si c'est une écurie (ECURIE/ECURIES)
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
                
                // Ajouter à la correspondance découverte
                this.correspondancesDecouvertes[nomAvecInitiale.toUpperCase().trim()] = meilleure.Nom || meilleure.NomPostal;
                
                return {
                    score: 0,
                    rang: meilleure.Rang,
                    nomTrouve: meilleure.Nom || meilleure.NomPostal,
                    item: meilleure
                };
            }
        }
        
        // *** NOUVEAU CODE POUR INITIALES ***
        // Détecter les formats d'initiales : JP. CAYROUZE, S. NOM, etc.
        const matchInitiales = nomAvecInitiale.match(/^([A-Z]+)\\.?\\s*([A-Z][A-Za-z\\s\\-]+)$/i);
        
        if (matchInitiales) {
            const initiales = matchInitiales[1].toUpperCase();
            const nomFamille = matchInitiales[2].trim().toUpperCase();
            
            console.log(`Recherche avec initiales: "${initiales}" pour "${nomFamille}"`);
            
            // Mapper les initiales aux prénoms possibles
            const prenomsConnus = {
                "JP": ["JEAN-PAUL", "JEAN PAUL"],
                "J": ["JEAN", "JACQUES", "JEROME"],
                "S": ["SERGE", "STEPHANE", "SEBASTIEN"],
                "F": ["FRANCOIS", "FREDERIC", "FRANCK"],
                "M": ["MICHEL", "MARC", "MATHIEU"],
                "P": ["PIERRE", "PATRICK", "PHILIPPE"],
                "A": ["ALAIN", "ANDRE", "ANTOINE"],
                "D": ["DANIEL", "DENIS", "DIDIER"],
                "C": ["CHRISTIAN", "CHRISTOPHE", "CLAUDE"],
                "G": ["GERARD", "GILBERT", "GUILLAUME"], // Ajout de G pour G.AUGU
                "MAT": ["MATHIEU", "MATTHIEU"],  // Ajout de MAT pour MAT. DAGUZAN-GARROS
                "E": ["ERIC", "EMMANUEL", "ETIENNE"],  // Ajout pour E. LEMAITRE
                "T": ["THIERRY", "THOMAS", "TONY"],     // Ajout pour T.DE LA HERONNIERE
                "JPJ": ["JEAN-PIERRE-JOSEPH", "JEAN PIERRE JOSEPH"], // Ajout pour JPJ. DUBOIS
                "PAT": ["PATRICK", "PATRICIA"]         // Ajout pour PAT. CHEDEVILLE
            };
            
            // Rechercher les correspondances potentielles
            let correspondances = [];
            
            // Si on a des prénoms associés aux initiales
            if (prenomsConnus[initiales]) {
                for (const prenom of prenomsConnus[initiales]) {
                    // Rechercher les noms qui contiennent le prénom et le nom de famille
                    const matches = donneesClassement.filter(item => {
                        const nomComplet = (item.Nom || item.NomPostal || "").toUpperCase();
                        return nomComplet.includes(prenom) && nomComplet.includes(nomFamille);
                    });
                    
                    correspondances = [...correspondances, ...matches];
                }
            } else {
                // Si on n'a pas de mapping pour ces initiales, chercher n'importe quel prénom commençant par ces initiales
                correspondances = donneesClassement.filter(item => {
                    const nomComplet = (item.Nom || item.NomPostal || "").toUpperCase();
                    const mots = nomComplet.split(/\\s+/);
                    
                    // Vérifier si le premier mot commence par l'initiale et si le nom complet contient le nom de famille
                    return mots.length > 0 && 
                           mots[0].startsWith(initiales) && 
                           nomComplet.includes(nomFamille);
                });
            }
            
            // Si on a trouvé des correspondances
            if (correspondances.length > 0) {
                // Trier par rang et prendre la meilleure
                const meilleure = correspondances.sort((a, b) => {
                    const rangA = parseInt(a.Rang) || 999;
                    const rangB = parseInt(b.Rang) || 999;
                    return rangA - rangB;
                })[0];
                
                console.log(`Correspondance trouvée via initiales: ${meilleure.Nom || meilleure.NomPostal}, Rang: ${meilleure.Rang}`);
                
                // Ajouter à la correspondance découverte
                this.correspondancesDecouvertes[nomAvecInitiale.toUpperCase().trim()] = meilleure.Nom || meilleure.NomPostal;
                
                return {
                    score: 0,
                    rang: meilleure.Rang,
                    nomTrouve: meilleure.Nom || meilleure.NomPostal,
                    item: meilleure
                };
            }
        }
        
        // Format traditionnel avec l'expression régulière originale
        const match = nomNormalise.match(/^(MME|MR|M)?\\s*([A-Z])\\.\\?\\s*([A-Z\\s]+)$/i);
        
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
                
                // Ajouter à la correspondance découverte
                this.correspondancesDecouvertes[nomAvecInitiale.toUpperCase().trim()] = meilleure.Nom || meilleure.NomPostal;
                
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
        
        // Nettoyer les noms tronqués (avec ...)
        nom = this.nettoyerNomTronque(nom);
        
        // Standardiser les apostrophes et autres cas spéciaux
        nom = this.normaliserNomAvecApostrophe(nom);
        
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
        
        // Vérifier aussi dans les correspondances découvertes
        if (this.correspondancesDecouvertes[nomUpper]) {
            const nomCorrespondance = this.correspondancesDecouvertes[nomUpper];
            console.log(`Correspondance découverte précédemment: "${nomUpper}" -> "${nomCorrespondance}"`);
            
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
        
        // *** NOUVEAU CODE POUR CHEVAUX ***
        // Vérifier s'il s'agit d'un nom de cheval avec suffixe (H.PS, F.PS, etc.)
        const matchSuffixeCheval = nom.match(/^(.+?)\\s+[HFM]\\.?P\\.?S\\.?.*/i);
        if (matchSuffixeCheval) {
            const nomSansSuffixe = matchSuffixeCheval[1].trim();
            console.log(`Recherche sans suffixe: "${nomSansSuffixe}"`);
            
            // Rechercher le nom sans suffixe dans les données
            for (const item of donneesClassement) {
                const nomItem = item.Nom || item.NomPostal || "";
                if (this.normaliserNom(nomItem) === this.normaliserNom(nomSansSuffixe)) {
                    console.log(`Correspondance sans suffixe trouvée: "${nomItem}"`);
                    
                    // Mémoriser cette correspondance pour l'avenir
                    this.correspondancesDecouvertes[nomUpper] = nomItem;
                    
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
                
                // Mémoriser cette correspondance
                this.correspondancesDecouvertes[nomUpper] = nomItem;
                
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
        const nomSansSuffixe = nomNormalise.replace(/\\s*\\([^)]+\\)|\\s+[HFM]\\.?P\\.?S\\.?.*/gi, "").trim();
        if (nomSansSuffixe !== nomNormalise) {
            console.log(`Recherche sans suffixe: "${nomSansSuffixe}"`);
            
            for (const item of donneesClassement) {
                const nomItem = item.Nom || item.NomPostal || "";
                const nomItemSansSuffixe = this.normaliserNom(nomItem).replace(/\\s*\\([^)]+\\)|\\s+[HFM]\\.?P\\.?S\\.?.*/gi, "").trim();
                
                if (nomItemSansSuffixe === nomSansSuffixe) {
                    console.log(`Correspondance sans suffixe trouvée: "${nomItem}"`);
                    
                    // Mémoriser cette correspondance
                    this.correspondancesDecouvertes[nomUpper] = nomItem;
                    
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
                
                // Mémoriser cette correspondance
                this.correspondancesDecouvertes[nomUpper] = nomItem;
                
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
            const nomEcurie = nomNormalise.replace(/^ECURIE\\s+/i, '').trim();
            
            // Recherche d'écurie simplifiée
            for (const item of donneesClassement) {
                const nomItem = this.normaliserNom(item.Nom || item.NomPostal || "");
                if (nomItem.startsWith('ECURIE') && 
                    (nomItem.includes(nomEcurie) || nomEcurie.includes(nomItem.replace(/^ECURIE\\s+/i, '').trim()))) {
                    
                    // Mémoriser cette correspondance
                    this.correspondancesDecouvertes[nomUpper] = item.Nom || item.NomPostal;
                    
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
        const motsNomOriginal = nomSansSuffixe.split(/\\s+/).filter(m => m.length > 1);
        
        donneesClassement.forEach(item => {
            const nomReference = this.normaliserNom(item.Nom || item.NomPostal || "");
            const nomReferenceSansSuffixe = nomReference.replace(/\\s*\\([^)]+\\)|\\s+[HFM]\\.?P\\.?S\\.?.*/gi, "").trim();
            const motsRef = nomReferenceSansSuffixe.split(/\\s+/).filter(m => m.length > 1);
            
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
            
            // Mémoriser cette correspondance si similarité > 70%
            if (correspondances[0].similarite > 70) {
                this.correspondancesDecouvertes[nomUpper] = correspondances[0].item.Nom || correspondances[0].item.NomPostal;
            }
            
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
            // AMÉLIORÉ: meilleure prise en charge des séparateurs et nettoyage de l'ellipse finale
            let noms = [];
            if (typeof nom === 'string') {
                // Nettoyer d'abord l'ellipse en fin de chaîne s'il y en a une
                const nomSansEllipse = this.nettoyerNomTronque(nom);
                noms = nomSansEllipse.split(/\\s*[,&\\/+]\\s*|\\s+et\\s+|\\s+and\\s+/i).filter(n => n.trim());
            } else {
                noms = [nom];
            }
            
            if (noms.length === 0 || !noms[0]) {
                return null;
            }
            
            console.log(`Propriétaire/éleveur séparé en ${noms.length} noms individuels:`, noms);
            
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
        // Standardiser les apostrophes et autres cas spéciaux
        nom = this.normaliserNomAvecApostrophe(nom);
        
        // Vérifier d'abord la table de correspondance manuelle
        const nomUpper = (nom || "").toUpperCase().trim();
        if (this.correspondanceManuelle[nomUpper]) {
            nom = this.correspondanceManuelle[nomUpper];
            console.log(`Correspondance manuelle utilisée: "${nomUpper}" -> "${nom}"`);
        }
        
        // NOUVEAU: utiliser extraireNomBaseCheval pour les chevaux
        if (categorie === 'chevaux') {
            const nomBase = this.extraireNomBaseCheval(nom);
            if (nomBase !== nom) {
                console.log(`Nom cheval simplifié pour recherche: "${nom}" -> "${nomBase}"`);
                nom = nomBase;
            }
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
            // AMÉLIORÉ: meilleure prise en charge des séparateurs et nettoyage de l'ellipse finale
            let noms = [];
            if (typeof nom === 'string') {
                // Nettoyer d'abord l'ellipse en fin de chaîne s'il y en a une
                const nomSansEllipse = this.nettoyerNomTronque(nom);
                noms = nomSansEllipse.split(/\\s*[,&\\/+]\\s*|\\s+et\\s+|\\s+and\\s+/i).filter(n => n.trim());
            } else {
                noms = [nom];
            }
            
            if (noms.length === 0 || !noms[0]) {
                return null;
            }
            
            console.log(`Propriétaire/éleveur séparé en ${noms.length} noms individuels:`, noms);
            
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
        // Standardiser les apostrophes et autres cas spéciaux
        nom = this.normaliserNomAvecApostrophe(nom);
        
        // Vérifier d'abord la table de correspondance manuelle
        const nomUpper = (nom || "").toUpperCase().trim();
        if (this.correspondanceManuelle[nomUpper]) {
            nom = this.correspondanceManuelle[nomUpper];
            console.log(`Correspondance manuelle utilisée: "${nomUpper}" -> "${nom}"`);
        }
        
        // NOUVEAU: utiliser extraireNomBaseCheval pour les chevaux
        if (categorie === 'chevaux') {
            const nomBase = this.extraireNomBaseCheval(nom);
            if (nomBase !== nom) {
                console.log(`Nom cheval simplifié pour recherche: "${nom}" -> "${nomBase}"`);
                nom = nomBase;
            }
        }
        
        const resultat = this.trouverMeilleurScore(donneesClassement, nom);
        return resultat.rang ? parseInt(resultat.rang) : null;
    },
    
    // Calculer le score moyen pour une liste de noms (propriétaires, éleveurs)
    calculerScoreMoyen(donneesClassement, listeNoms, categorie) {
        // Si c'est une chaîne, la diviser sur les virgules et autres séparateurs possibles
        // AMÉLIORÉ: meilleure prise en charge des séparateurs et nettoyage de l'ellipse finale
        let noms = [];
        if (typeof listeNoms === 'string') {
            // Nettoyer d'abord l'ellipse en fin de chaîne s'il y en a une
            const nomSansEllipse = this.nettoyerNomTronque(listeNoms);
            noms = nomSansEllipse.split(/\\s*[,&\\/+]\\s*|\\s+et\\s+|\\s+and\\s+/i).filter(n => n.trim());
        } else {
            noms = [listeNoms];
        }
        
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
        const nomCourseSansSuffixe = nomCourseTrim.replace(/\\s+[HFM]\\.?P\\.?S\\.?.*/gi, "").trim();
        if (nomCourseSansSuffixe !== nomCourseTrim) {
            this.correspondanceManuelle[nomCourseSansSuffixe] = nomClassementTrim;
            console.log(`✅ Variante sans suffixe ajoutée: "${nomCourseSansSuffixe}" -> "${nomClassementTrim}"`);
        }
    },
    
    // Helpers pour les calculs de score - déclarés au niveau de l'objet
    getRangMax(categorie) {
        // Protection contre l'asynchronisme
        if (!this.data || !this.data[categorie] || !this.data[categorie].length) {
            return 100; // Valeur par défaut
        }
        return this.data[categorie].length;
    },

    // Normalise un rang sur échelle 0-1
    normalizeRang(rang, maxRang) {
        if (!rang || rang === 'NC') {
            return 0; // Retourner 0 au lieu de null pour éviter les problèmes
        }
        return Math.max(0, 1 - (rang - 1) / (maxRang - 1));
    },

    // Normalise le score poids porté (-2 à +2) vers 0-1
    normalizePoids(poidsScore) {
        return Math.max(0, Math.min(1, (poidsScore + 2) / 4));
    },

    // Normalise le score de corde (-2 à +3) vers 0-1
    normalizeCorde(cordeScore) {
        return Math.max(0, Math.min(1, (cordeScore + 2) / 5));
    },
    
    calculateNCValue(rangsPresents) {
        if (!rangsPresents || !rangsPresents.length) {
            return 0.20;
        }

        const totalPoids = rangsPresents.reduce((sum, item) => sum + item.poids, 0);
        if (totalPoids === 0) return 0.20;

        const moyenneRang = rangsPresents.reduce((sum, item) => sum + item.rang * item.poids, 0) / totalPoids;
        const maxRang = this.getRangMax('chevaux');
        
        let ncValue = 1 - (moyenneRang - 1) / (maxRang - 1);
        
        if (ncValue > 1) {
            ncValue = ncValue / 100;
        }
        
        return Math.max(0, Math.min(1, ncValue));
    },
    
    // NOUVELLE VERSION: Calculer le score prédictif pour un participant avec poids dynamiques
    calculerScoreParticipant(participant, courseContext) {
        // Récupérer les poids dynamiques selon le contexte de la course
        const poids = courseContext ? this.getWeights(courseContext) : {
            cheval: 0.40, jockey: 0.20, entraineur: 0.15, eleveur: 0.10, proprietaire: 0.10, 
            poids_porte: 0.03, corde: 0.02
        };
        
        // NOUVEAU: Utiliser le nom de base pour les chevaux
        const nomChevalBase = this.extraireNomBaseCheval(participant.cheval);
        console.log(`Nom cheval normalisé pour scoring: "${participant.cheval}" -> "${nomChevalBase}"`);
        
        // Récupérer les items pour chaque acteur avec le nom normalisé
        const itemCheval = this.trouverItemDansClassement(this.data.chevaux, nomChevalBase, 'chevaux');
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
        
        // NOUVEAU: Calculer le score du poids porté
        let poidsPorteScore = 0;
        
        // 1. Calculer le poids moyen du peloton
        const poidsPorteValue = this.extractWeight(participant.poids);
        if (poidsPorteValue !== null && courseContext && courseContext.participants) {
            const moyennePoids = this.calculateAverageWeight(courseContext.participants);
            
            if (moyennePoids) {
                // 2. Déterminer l'écart de poids
                const ecartPoids = poidsPorteValue - moyennePoids;
                
                // 3. Déterminer la catégorie de poids
                const poidsCategory = this.getWeightBucket(poidsPorteValue, moyennePoids);
                
                // 4. Récupérer l'ajustement de base selon la catégorie
                let ajustementBase = this.WEIGHT_ADJUSTMENTS[poidsCategory].adjustment;
                
                // 5. Moduler l'ajustement en fonction de la distance
                const distanceBucket = this.getDistanceBucket(courseContext.distance);
                const distanceMultiplier = this.WEIGHT_DISTANCE_MULTIPLIERS[distanceBucket];
                
                // 6. Calculer l'ajustement final
                const ajustementFinal = ajustementBase * distanceMultiplier;
                
                // Logs pour le débogage
                console.log(`Poids porté: ${poidsPorteValue}kg, Moyenne: ${moyennePoids}kg, Écart: ${ecartPoids}kg`);
                console.log(`Catégorie de poids: ${poidsCategory}, Ajustement de base: ${ajustementBase}`);
                console.log(`Distance: ${courseContext.distance}m, Bucket: ${distanceBucket}, Multiplicateur: ${distanceMultiplier}`);
                console.log(`Ajustement final pour le poids porté: ${ajustementFinal}`);
                
                // 7. Convertir en score (échelle 0-100)
                // On utilise une échelle où l'ajustement max +2% = +2 points sur 100
                poidsPorteScore = (ajustementFinal * 100);
            } else {
                console.log("Impossible de calculer le poids moyen du peloton - poids porté non pris en compte");
            }
        } else {
            console.log("Données de poids insuffisantes - poids porté non pris en compte");
        }
        
        // NOUVEAU: Calculer le score de la corde
        let cordeScore = 0;
        const numeroCorde = this.extraireNumeroCorde(participant.corde);
        if (numeroCorde) {
            // Déterminer le type de piste en fonction de l'hippodrome et de la distance
            const typePiste = this.getTypePiste(courseContext.hippodrome, courseContext.distance);
            
            // Obtenir la catégorie de corde
            const cordeBucket = this.getCordeBucket(numeroCorde, typePiste);
            
            // Appliquer l'ajustement correspondant
            cordeScore = this.CORDE_WEIGHTS[typePiste][cordeBucket] * 100;
            
            console.log(`Corde: ${numeroCorde}, Type piste: ${typePiste}, Bucket: ${cordeBucket}, Score: ${cordeScore}`);
        } else {
            console.log("Pas de numéro de corde trouvé pour ce participant");
        }
        
        // Logs pour debug
        console.log(`Rangs récupérés pour ${participant.cheval}: `, {
            cheval: rangCheval,
            jockey: rangJockey,
            entraineur: rangEntraineur,
            eleveur: rangEleveur,
            proprietaire: rangProprio,
            poids_porte_score: poidsPorteScore,
            corde_score: cordeScore
        });
        
        // AMÉLIORATION: Calcul dynamique de la valeur par défaut pour les NC avec pondération
        const rangsPresents = [];
        
        // Collecter les rangs présents avec leurs poids
        if (rangCheval !== null) rangsPresents.push({ rang: rangCheval, poids: poids.cheval });
        if (rangJockey !== null) rangsPresents.push({ rang: rangJockey, poids: poids.jockey });
        if (rangEntraineur !== null) rangsPresents.push({ rang: rangEntraineur, poids: poids.entraineur });
        if (rangEleveur !== null) rangsPresents.push({ rang: rangEleveur, poids: poids.eleveur });
        if (rangProprio !== null) rangsPresents.push({ rang: rangProprio, poids: poids.proprietaire });
        
        // Calcul de l'indice de confiance (mis à jour avec poids porté et corde)
        const elementsPresents = [
            !!rangCheval, 
            !!rangJockey,
            !!rangEntraineur, 
            !!rangEleveur,
            !!rangProprio,
            (poidsPorteScore !== 0), // Le poids porté compte comme un élément présent uniquement s'il a une valeur
            (cordeScore !== 0)       // La corde compte comme un élément présent uniquement si elle a une valeur
        ].filter(Boolean).length;
        
        // Nombre total d'éléments (y compris poids porté et corde)
        const nombreTotalElements = 7;
        
        const indiceConfiance = elementsPresents / nombreTotalElements;
        
        // AMÉLIORATION: Valeur par défaut dynamique basée sur une moyenne pondérée
        const valeurNC = this.calculateNCValue(rangsPresents);
        
        // Normaliser les rangs en scores 0-1
        const scoreCheval = rangCheval ? this.normalizeRang(rangCheval, this.getRangMax('chevaux')) : valeurNC;
        const scoreJockey = rangJockey ? this.normalizeRang(rangJockey, this.getRangMax('jockeys')) : valeurNC;
        const scoreEntraineur = rangEntraineur ? this.normalizeRang(rangEntraineur, this.getRangMax('entraineurs')) : valeurNC;
        const scoreEleveur = rangEleveur ? this.normalizeRang(rangEleveur, this.getRangMax('eleveurs')) : valeurNC;
        const scoreProprio = rangProprio ? this.normalizeRang(rangProprio, this.getRangMax('proprietaires')) : valeurNC;
        
        // Normaliser les scores de poids et corde
        const poidsNormalized = this.normalizePoids(poidsPorteScore / 100);
        const cordeNormalized = this.normalizeCorde(cordeScore / 100);
        
        // AMÉLIORATION: Ajuster l'indice de confiance selon l'importance des éléments manquants
        let indiceConfianceAjuste = indiceConfiance;
        
        // Si le cheval est manquant, c'est plus problématique
        if (!rangCheval) {
            indiceConfianceAjuste *= 0.8; // Pénalité plus forte si le cheval est manquant
        }
        
        // Calculer le score pondéré
        const scorePondere = (
            poids.cheval * scoreCheval +
            poids.jockey * scoreJockey +
            poids.entraineur * scoreEntraineur +
            poids.eleveur * scoreEleveur +
            poids.proprietaire * scoreProprio +
            poids.poids_porte * poidsNormalized +
            poids.corde * cordeNormalized
        );
        
        // Convertir en score 0-100
        const scoreFinal = scorePondere * 100;
        
        // Retourner le résultat
        return {
            score: scoreFinal.toFixed(1),
            indiceConfiance: indiceConfianceAjuste.toFixed(2),
            poidsUtilises: poids,
            details: {
                cheval: {
                    rang: rangCheval || "NC",
                    score: (scoreCheval * 100).toFixed(1)
                },
                jockey: {
                    rang: rangJockey || "NC",
                    score: (scoreJockey * 100).toFixed(1)
                },
                entraineur: {
                    rang: rangEntraineur || "NC",
                    score: (scoreEntraineur * 100).toFixed(1)
                },
                eleveur: {
                    rang: rangEleveur || "NC",
                    score: (scoreEleveur * 100).toFixed(1)
                },
                proprietaire: {
                    rang: rangProprio || "NC",
                    score: (scoreProprio * 100).toFixed(1)
                },
                poids_porte: {
                    valeur: (participant.poids || "NC"),
                    score: poidsPorteScore.toFixed(1)
                },
                corde: {
                    valeur: numeroCorde || "NC",
                    score: cordeScore.toFixed(1)
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
            const scorePredictif = this.calculerScoreParticipant(participant, course);
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
        let nbExAequo = 0;
        
        resultatsTries.forEach((resultat, index) => {
            const scoreActuel = parseFloat(resultat.scorePredictif.score);
            
            if (scorePrec !== null && Math.abs(scoreActuel - scorePrec) < 0.01) {
                // Ex-aequo: même rang
                nbExAequo++;
            } else {
                // Nouveau score: nouveau rang
                rang = index + 1;
                nbExAequo = 0;
            }
            
            resultat.rangPredit = rang;
            scorePrec = scoreActuel;
        });
        
        return resultatsTries;
    }
};
