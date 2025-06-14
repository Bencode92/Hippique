// Correctif pour les expressions régulières dans ranking-loader.js
// Ce script corrige les regex problématiques en utilisant les classes Unicode modernes

// Méthode pour patcher le module ranking-loader après son chargement
(function() {
    // Attendre que le module soit chargé
    if (typeof rankingLoader === 'undefined') {
        console.warn('ranking-loader.js doit être chargé avant ranking-loader-fix.js');
        return;
    }
    
    console.log('🔧 Application du correctif pour les expressions régulières...');
    
    // Sauvegarder les fonctions originales
    const originalExtraireNomBaseCheval = rankingLoader.extraireNomBaseCheval;
    const originalNormaliserNom = rankingLoader.normaliserNom;
    
    // Remplacer extraireNomBaseCheval avec la version corrigée
    rankingLoader.extraireNomBaseCheval = function(nom) {
        if (!nom) return "";
        
        // Version moderne avec classe Unicode
        // \p{L} = toute lettre Unicode, \p{Z} = tout espace Unicode
        const regex = /^([\p{L}\p{Z}'-]+?)(?:\s+[HFM]\.?P\.?S\.?\s*\d+\s*a\.?.*)?$/iu;
        const match = nom.match(regex);
        
        if (match) {
            return match[1].trim();
        }
        
        return nom;
    };
    
    // Remplacer la partie problématique dans normaliserNom
    rankingLoader.normaliserNom = function(nom) {
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
        
        // AMÉLIORATION: Expression régulière corrigée avec classes Unicode
        const matchSuffixeCheval = nomNormalise.match(/^([\p{L}\p{Z}'-]+?)(\s+[HFM]\.?P\.?S\.?.*$)/iu);
        if (matchSuffixeCheval) {
            nomNormalise = matchSuffixeCheval[1].trim();
            console.log(`Nom cheval normalisé (suffixe supprimé): "${nom}" -> "${nomNormalise}"`);
        } else {
            // Si pas de suffixe, utiliser l'ancienne méthode pour l'origine (GB), etc.
            const matchCheval = nomNormalise.match(/^([\p{L}\p{Z}'-]+?)(\s*\((\p{L}+)\))?(\s+[HFM]\.?P\.?S\.?.*)?$/iu);
            
            if (matchCheval) {
                const nomBase = matchCheval[1].trim();
                const origine = matchCheval[3] ? `(${matchCheval[3].trim()})` : "";
                
                // Reconstruire le nom standardisé
                nomNormalise = nomBase + (origine ? ` ${origine}` : "");
                console.log(`Nom cheval normalisé (avec origine): "${nom}" -> "${nomNormalise}"`);
            }
        }
        
        // Standardiser les préfixes pour personnes
        nomNormalise = nomNormalise.replace(/^M\.\s*/i, "MR ")
                                .replace(/^MME\.\s*/i, "MME ")
                                .replace(/^MLLE\.\s*/i, "MLLE ");
        
        // Standardiser les préfixes pour écuries (EC, ECURIE, ECURIES)
        nomNormalise = nomNormalise.replace(/^EC\./i, "ECURIE ")
                                .replace(/^EC\s+/i, "ECURIE ")
                                .replace(/^ECURIES\s+/i, "ECURIE ");
        
        return nomNormalise;
    };
    
    // Fonction helper pour détecter si le navigateur supporte les classes Unicode
    function supportsUnicodePropertyEscapes() {
        try {
            new RegExp('\\p{L}', 'u');
            return true;
        } catch (e) {
            return false;
        }
    }
    
    // Si le navigateur ne supporte pas les classes Unicode, utiliser une version fallback
    if (!supportsUnicodePropertyEscapes()) {
        console.warn('⚠️ Votre navigateur ne supporte pas les classes Unicode. Utilisation du fallback.');
        
        // Fallback avec les plages corrigées (tiret à la fin)
        rankingLoader.extraireNomBaseCheval = function(nom) {
            if (!nom) return "";
            
            // Tiret placé à la fin pour éviter l'interprétation comme plage
            const regex = /^([A-Za-zÀ-ÿ\s'-]+?)(?:\s+[HFM]\.?P\.?S\.?\s*\d+\s*a\.?.*)?$/i;
            const match = nom.match(regex);
            
            if (match) {
                return match[1].trim();
            }
            
            return nom;
        };
        
        // Redéfinir normaliserNom avec le fallback
        rankingLoader.normaliserNom = function(nom) {
            if (!nom) return "";
            
            nom = this.nettoyerNomTronque(nom);
            nom = this.normaliserNomAvecApostrophe(nom);
            
            const nomUpper = nom.toUpperCase().trim();
            if (this.correspondanceManuelle[nomUpper]) {
                return this.correspondanceManuelle[nomUpper];
            }
            
            if (this.correspondancesDecouvertes[nomUpper]) {
                return this.correspondancesDecouvertes[nomUpper];
            }
            
            let nomNormalise = nomUpper;
            
            // Tiret à la fin de la classe
            const matchSuffixeCheval = nomNormalise.match(/^([A-Za-zÀ-ÿ\s'-]+?)(\s+[HFM]\.?P\.?S\.?.*$)/i);
            if (matchSuffixeCheval) {
                nomNormalise = matchSuffixeCheval[1].trim();
            } else {
                const matchCheval = nomNormalise.match(/^([A-Za-zÀ-ÿ\s'-]+?)(\s*\(([A-Za-z]+)\))?(\s+[HFM]\.?P\.?S\.?.*)?$/i);
                
                if (matchCheval) {
                    const nomBase = matchCheval[1].trim();
                    const origine = matchCheval[3] ? `(${matchCheval[3].trim()})` : "";
                    nomNormalise = nomBase + (origine ? ` ${origine}` : "");
                }
            }
            
            nomNormalise = nomNormalise.replace(/^M\.\s*/i, "MR ")
                                      .replace(/^MME\.\s*/i, "MME ")
                                      .replace(/^MLLE\.\s*/i, "MLLE ")
                                      .replace(/^EC\./i, "ECURIE ")
                                      .replace(/^EC\s+/i, "ECURIE ")
                                      .replace(/^ECURIES\s+/i, "ECURIE ");
            
            return nomNormalise;
        };
    }
    
    console.log('✅ Correctif appliqué avec succès!');
    
    // Test rapide pour vérifier que le correctif fonctionne
    try {
        const testNom = "CORTEZ BANK H.PS. 6 A.";
        const resultat = rankingLoader.extraireNomBaseCheval(testNom);
        console.log(`Test du correctif: "${testNom}" -> "${resultat}"`);
    } catch (e) {
        console.error('❌ Erreur lors du test du correctif:', e);
    }
})();
