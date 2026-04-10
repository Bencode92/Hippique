/**
 * Module de gestion des cordes pour les courses hippiques
 * Ce module permet d'extraire le numéro de corde à partir de différents formats
 * et de calculer l'avantage/désavantage pour le système de pondération.
 */

// Définir l'objet comme une extension du rankingLoader
if (typeof window.rankingLoader === 'undefined') {
    window.rankingLoader = {};
}

// Ajouter les méthodes de gestion des cordes
window.rankingLoader.cordeHandler = {
    // Impact de la corde — réduit ×0.5 (optimisation grid search)
    CORDE_IMPACT: {
        "sprint": 0.5,      // Impact modéré en sprint
        "mile": 0.3,        // Impact léger pour le mile
        "middle": 0.15,     // Impact faible
        "staying": 0.05     // Quasi nul
    },

    // Avantage des cordes — calibré pour donner ±8 pts en sprint, ±0.8 pts en staying
    CORDE_ADVANTAGE: {
        "default": {
            1: +8.0,   // Corde au rail = parcours le plus court
            2: +6.0,   // Très bon
            3: +4.0,   // Bon
            4: +2.0,   // Léger avantage
            5: +1.0,
            6: 0,      // Neutre
            7: -1.0,
            8: -2.0,
            9: -3.0,
            10: -4.0,
            11: -5.0,
            12: -6.0,  // À partir de 12 c'est un vrai handicap
            13: -6.5,
            14: -7.0,
            15: -7.5,
            16: -8.0,
            17: -8.0,
            18: -8.0,
            19: -8.0,
            20: -8.0
        },
        // Longchamp : virage serré, corde encore plus importante
        "PARISLONGCHAMP": {
            1: +10.0, 2: +7.0, 3: +5.0, 4: +3.0, 5: +1.0,
            6: 0, 7: -1.0, 8: -3.0, 9: -4.0, 10: -6.0,
            11: -7.0, 12: -8.0, 13: -9.0, 14: -10.0
        },
        // Chantilly ligne droite 1000m : corde quasi sans impact (pas de virage)
        "CHANTILLY": {
            1: +1.0, 2: +0.5, 3: 0, 4: 0, 5: 0,
            6: 0, 7: 0, 8: -0.5, 9: -0.5, 10: -1.0,
            11: -1.0, 12: -1.0, 13: -1.0, 14: -1.0
        },
        // Deauville : piste large, corde moins importante
        "DEAUVILLE": {
            1: +5.0, 2: +3.0, 3: +2.0, 4: +1.0, 5: 0,
            6: 0, 7: -1.0, 8: -2.0, 9: -3.0, 10: -4.0,
            11: -5.0, 12: -5.0, 13: -5.0, 14: -5.0
        }
    },

    /**
     * Extraire le numéro de corde d'une chaîne de caractères
     * Gère différents formats comme "(Corde:04)" ou "Corde 4" ou juste "4"
     * @param {string} cordeString - Chaîne de caractères contenant l'information de corde
     * @returns {number|null} - Numéro de corde extrait ou null si non trouvé
     */
    extractCordeNumber: function(cordeString) {
        if (!cordeString || typeof cordeString !== 'string') {
            return null;
        }
        
        try {
            // Gérer le format "(Corde:04)" ou variantes
            const match = cordeString.match(/\(Corde:(\d+)\)/i);
            if (match && match[1]) {
                return parseInt(match[1], 10);
            }
            
            // Format alternatif "Corde 4" ou "Corde: 4"
            const altMatch = cordeString.match(/Corde\s*:?\s*(\d+)/i);
            if (altMatch && altMatch[1]) {
                return parseInt(altMatch[1], 10);
            }
            
            // Format simple - juste un nombre
            const numMatch = cordeString.match(/^(\d+)$/);
            if (numMatch && numMatch[1]) {
                return parseInt(numMatch[1], 10);
            }
            
            console.log("Format de corde non reconnu:", cordeString);
            return null;
        } catch (error) {
            console.error("Erreur lors du traitement de la corde:", error);
            return null;
        }
    },

    /**
     * Calcule l'impact de la corde sur le score prédictif
     * @param {number|null} cordeNumber - Numéro de corde
     * @param {object} courseContext - Contexte de la course (distance, hippodrome, etc.)
     * @returns {object} - Impact calculé avec score et explication
     */
    calculateCordeImpact: function(cordeNumber, courseContext) {
        if (cordeNumber === null) {
            return { 
                score: 0,
                explication: "Corde inconnue - aucun impact" 
            };
        }

        // Déterminer le facteur d'impact selon la distance
        const distanceBucket = window.rankingLoader.getDistanceBucket(courseContext.distance);
        const impactFactor = this.CORDE_IMPACT[distanceBucket] || this.CORDE_IMPACT.mile;
        
        // Déterminer l'hippodrome et choisir la configuration appropriée
        const hippodrome = courseContext.hippodrome ? courseContext.hippodrome.toUpperCase() : null;
        const cordeConfig = this.CORDE_ADVANTAGE[hippodrome] || this.CORDE_ADVANTAGE.default;
        
        // Obtenir l'avantage de base pour cette corde
        let advantage = cordeConfig[cordeNumber] || 0;
        
        // Si la corde est au-delà de ce qui est défini, utiliser la valeur de la corde 20
        if (cordeNumber > 20 && !cordeConfig[cordeNumber]) {
            advantage = cordeConfig[20] || -3.0;
        }
        
        // Calculer le score final basé sur l'avantage et le facteur d'impact
        const finalScore = advantage * impactFactor;
        
        let explication;
        if (finalScore > 0) {
            explication = `Corde ${cordeNumber} avantageuse (+${advantage.toFixed(1)} points, impact ${(impactFactor*100).toFixed(0)}%)`;
        } else if (finalScore < 0) {
            explication = `Corde ${cordeNumber} désavantageuse (${advantage.toFixed(1)} points, impact ${(impactFactor*100).toFixed(0)}%)`;
        } else {
            explication = `Corde ${cordeNumber} neutre (impact ${(impactFactor*100).toFixed(0)}%)`;
        }
        
        return {
            score: finalScore,
            explication: explication,
            advantage: advantage,
            impactFactor: impactFactor
        };
    }
};

// Étendre la fonction calculerScoreParticipant pour prendre en compte la corde
const originalCalculerScoreParticipant = window.rankingLoader.calculerScoreParticipant;
if (typeof originalCalculerScoreParticipant === 'function') {
    window.rankingLoader.calculerScoreParticipant = function(participant, courseContext) {
        // Appel à la fonction originale
        const resultatOriginal = originalCalculerScoreParticipant.call(this, participant, courseContext);
        
        // Ajouter l'impact de la corde si elle existe
        if (participant.corde) {
            const cordeNumber = this.cordeHandler.extractCordeNumber(participant.corde);
            const cordeImpact = this.cordeHandler.calculateCordeImpact(cordeNumber, courseContext);
            
            // Récupérer le score de base
            const scoreBase = parseFloat(resultatOriginal.score);
            
            // Ajouter l'impact de la corde
            const nouveauScore = scoreBase + cordeImpact.score;
            
            // Mettre à jour le score
            resultatOriginal.score = nouveauScore.toFixed(1);
            
            // Ajouter les détails de la corde
            resultatOriginal.details.corde = {
                numero: cordeNumber,
                impact: cordeImpact.score.toFixed(1),
                explication: cordeImpact.explication
            };
            
            console.log(`Score ajusté avec corde pour ${participant.cheval}: ${scoreBase} + ${cordeImpact.score.toFixed(1)} = ${nouveauScore.toFixed(1)}`);
        }
        
        return resultatOriginal;
    };
} else {
    console.warn("Impossible d'étendre la fonction calculerScoreParticipant. Vérifiez l'ordre de chargement des scripts.");
}

console.log("Module corde-handler.js chargé avec succès");
