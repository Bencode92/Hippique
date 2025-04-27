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
    // Poids d'impact de la corde par type de distance
    // L'impact de la corde est plus important dans les sprints que sur les longues distances
    CORDE_IMPACT: {
        "sprint": 0.08,     // Impact fort pour les sprints (<1400m)
        "mile": 0.05,       // Impact moyen pour le mile (1400-1900m)
        "middle": 0.03,     // Impact faible pour moyenne distance (1900-2400m)
        "staying": 0.01     // Impact très faible pour longue distance (>2400m)
    },

    // Avantage des cordes en fonction du type de parcours (général)
    // Pour la plupart des hippodromes, les cordes basses (1-3) sont avantageuses
    CORDE_ADVANTAGE: {
        "default": {
            // Format: numéro de corde => modificateur de score
            1: +3.0,  // Forte influence positive pour corde 1
            2: +2.0,  // Influence positive pour corde 2
            3: +1.0,  // Légère influence positive pour corde 3
            4: 0,     // Neutre
            5: 0,
            6: -0.5,  // Légère influence négative
            7: -0.5,
            8: -1.0,  // Influence négative 
            9: -1.0,
            // Plus la corde est haute, plus c'est désavantageux
            10: -1.5,
            11: -1.5,
            12: -2.0,
            13: -2.0,
            14: -2.5,
            15: -2.5,
            16: -3.0,
            17: -3.0,
            18: -3.0,
            19: -3.0,
            20: -3.0
        },
        // Configurations spécifiques pour certains hippodromes
        // À remplir au besoin avec des données précises
        "PARISLONGCHAMP": {
            // Légèrement différent du schéma par défaut
            1: +3.5,  // Plus avantageux
            2: +2.5,
            3: +1.5,
            4: +0.5,
            5: 0,
            6: -0.5,
            7: -1.0,
            8: -1.5,
            9: -2.0,
            10: -2.5,
            11: -3.0,
            12: -3.0,
            // etc.
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
