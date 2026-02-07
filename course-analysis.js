// Script pour la gestion du sélecteur de course et l'affichage du classement théorique
// v3.0 — Quick wins: forme récente, poids porté, percentile, corde, population
// v2.0 — Branchement pipeline rankings pondérés + fixes P0-P5

// ─── Rankings data (chargé au démarrage via loadRankings) ───
let rankingsData = {
    chevaux: {},
    jockeys: {},
    entraineurs: {},
    eleveurs: {},
    proprietaires: {}
};
let rankingsPopulation = {}; // { chevaux: 1234, jockeys: 567, ... } pour normalisation percentile
let rankingsLoaded = false;

// ─── P0: Canoniser les clés accentuées des participants JSON ───
function canonicalizeParticipant(p) {
    return {
        numero:       p['n°']           || p.numero       || '',
        cheval:       p.cheval          || '',
        cheval_url:   p.cheval_url      || '',
        pere_mere:    p['père_mère']    || p.pere_mere    || '',
        corde:        p.corde           || '',
        proprietaire: p['propriétaire'] || p.proprietaire  || '',
        entraineur:   p.entraineur      || '',
        dep_pays_ent: p['dép_pays_ent'] || p.dep_pays_ent || '',
        jockey:       p.jockey          || '',
        poids:        p.poids           || '',
        gains:        p.gains           || '',
        performances: p.performances    || '',
        valeur:       p.valeur          || '',
        equipements:  p['equipement(s)']|| p.equipements   || '',
        eleveurs:     p['éleveurs']     || p.eleveurs      || '',
        couleurs:     p.couleurs        || ''
    };
}

// ─── P1: ID unique par course (évite collisions sur course.nom) ───
function getCourseId(course) {
    return course.url || `${course.numero || ''}|${course.horaire || ''}|${course.nom || ''}`;
}

// ─── P3: Échapper HTML pour prévenir XSS depuis données scrapées ───
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

// ─── Fallback getDistanceBucket si absent de ranking-loader.js ───
if (typeof window.rankingLoader === 'undefined') {
    window.rankingLoader = {};
}
if (!window.rankingLoader.getDistanceBucket) {
    window.rankingLoader.getDistanceBucket = function(distance) {
        const d = parseInt(distance) || 2000;
        if (d < 1400) return 'sprint';
        if (d < 1900) return 'mile';
        if (d < 2400) return 'middle';
        return 'staying';
    };
}

// ─── P2: Charger les rankings pondérés depuis le pipeline ───
async function loadRankings() {
    const categories = ['chevaux', 'jockeys', 'entraineurs', 'eleveurs', 'proprietaires'];
    const promises = categories.map(async (cat) => {
        try {
            const resp = await fetch(`data/${cat}_ponderated_latest.json`);
            if (!resp.ok) {
                console.warn(`Rankings ${cat}: HTTP ${resp.status}`);
                return;
            }
            const json = await resp.json();
            const map = {};
            (json.resultats || []).forEach(item => {
                // chevaux utilisent "Nom", les autres "NomPostal"
                const key = (cat === 'chevaux' ? item.Nom : item.NomPostal) || '';
                if (!key) return;
                map[key.toUpperCase().trim()] = {
                    scoreMixte: parseFloat(item.ScoreMixte) || 999,
                    rang: parseInt(item.Rang) || 9999,
                    victoires: parseInt(item.NbVictoires || item.Victoires || 0),
                    tauxVictoire: parseFloat(item.TauxVictoire || 0),
                    tauxPlace: parseFloat(item.TauxPlace || 0)
                };
            });
            rankingsData[cat] = map;
            // Stocker la population totale pour normalisation percentile
            rankingsPopulation[cat] = (json.metadata && json.metadata.totalPopulation) || Object.keys(map).length;
            console.log(`✅ Rankings ${cat}: ${Object.keys(map).length} entrées (pop: ${rankingsPopulation[cat]})`);
        } catch (e) {
            console.warn(`⚠️ Rankings ${cat} indisponibles:`, e.message);
        }
    });
    await Promise.all(promises);
    rankingsLoaded = true;
    console.log('Rankings chargés:', Object.entries(rankingsData).map(([k,v]) => `${k}:${Object.keys(v).length}`).join(', '));
    console.log('Populations:', JSON.stringify(rankingsPopulation));
}

// ─── Score de forme récente (basé sur les dernières performances) ───
// Parse "1p 3p 0p 2p 5p" → score pondéré avec décroissance exponentielle
function calculerScoreForme(performances) {
    if (!performances || typeof performances !== 'string') return null;

    // Parser "1p 3p 0p 2p 5p" → [1, 3, 0, 2, 5]
    const results = performances.match(/(\d+)p/g);
    if (!results || results.length === 0) return null;

    const positions = results.map(r => parseInt(r.replace('p', ''), 10));

    // Barème : 1er=10, 2e=7, 3e=5, 4e=3, 5e=1, reste/0=0
    const POINTS = { 1: 10, 2: 7, 3: 5, 4: 3, 5: 1 };

    // Décroissance exponentielle : course la plus récente pèse le plus
    const DECAY = 0.7;
    let weightedSum = 0;
    let totalWeight = 0;

    positions.forEach((pos, i) => {
        const weight = Math.pow(DECAY, i); // i=0 → 1.0, i=1 → 0.7, i=2 → 0.49...
        const points = (pos > 0 && pos <= 5) ? (POINTS[pos] || 0) : 0;
        weightedSum += weight * points;
        totalWeight += weight;
    });

    if (totalWeight === 0) return null;

    // Normaliser sur 0-100 : max théorique = 10 (toujours 1er)
    return Math.min(100, (weightedSum / totalWeight) * 10);
}

// ─── P2: Scoring basé sur les rankings pipeline (remplace l'ancien hardcodé) ───
// Pondération inter-catégories: cheval 50%, jockey 30%, entraîneur 10%, éleveur 5%, propriétaire 5%
const CATEGORY_WEIGHTS = {
    cheval: 0.50,
    jockey: 0.30,
    entraineur: 0.10,
    eleveur: 0.05,
    proprietaire: 0.05
};

// Map catégorie scoring → catégorie rankings
const CATEGORY_TO_RANKINGS_KEY = {
    cheval: 'chevaux',
    jockey: 'jockeys',
    entraineur: 'entraineurs',
    eleveur: 'eleveurs',
    proprietaire: 'proprietaires'
};

function calculerScoreTheorique(p, poidsMoyen) {
    // Normaliser les noms pour lookup
    // Cheval: retirer suffixes type "F.PS. 5 a." → garder le nom avant
    const chevalNom = (p.cheval || '').replace(/\s+[A-Z]\.\w+\.?\s*\d*\s*[a-z]?\.?$/i, '').trim().toUpperCase();
    const jockeyNom = (p.jockey || '').toUpperCase().trim();
    const entraineurNom = (p.entraineur || '').toUpperCase().trim();
    // Premier éleveur seulement (souvent liste séparée par virgules)
    const eleveurNom = (p.eleveurs || '').split(',')[0].toUpperCase().trim();
    const proprietaireNom = (p.proprietaire || '').toUpperCase().trim();

    // Lookup dans rankings pondérés
    const lookups = {
        cheval: rankingsData.chevaux[chevalNom] || null,
        jockey: rankingsData.jockeys[jockeyNom] || null,
        entraineur: rankingsData.entraineurs[entraineurNom] || null,
        eleveur: rankingsData.eleveurs[eleveurNom] || null,
        proprietaire: rankingsData.proprietaires[proprietaireNom] || null
    };

    // P4: Compter les hits pour badge de confiance
    const hits = Object.values(lookups).filter(Boolean).length;

    // Si 0 hits dans les rankings, fallback sur valeur handicap comme proxy
    if (hits === 0) {
        const fallbackScore = parseFloat(p.valeur) || 0;
        // Convertir valeur handicap en score 0-100 (valeur typique: 15-60, centrer sur 50)
        let normalizedFallback = Math.min(100, Math.max(0, 50 + (fallbackScore - 30) * 1.5));

        // Même en fallback, intégrer la forme si disponible
        const scoreForme = calculerScoreForme(p.performances);
        if (scoreForme !== null) {
            normalizedFallback = normalizedFallback * 0.85 + scoreForme * 0.15;
        }

        return { score: normalizedFallback, confidence: 0, hits: 0, forme: scoreForme };
    }

    // Normalisation percentile : score = 100 × (1 - (rang-1) / (population-1))
    // Rang 1 → 100, dernier rang → 0. Tient compte de la taille réelle de chaque catégorie.
    function rangToScore(rang, category) {
        const catKey = CATEGORY_TO_RANKINGS_KEY[category] || category;
        const pop = rankingsPopulation[catKey] || 200; // fallback conservateur
        if (pop <= 1) return 100; // un seul acteur = score max
        return Math.max(0, Math.min(100, 100 * (1 - (rang - 1) / (pop - 1))));
    }

    // Pondération dynamique: ne compter que les composantes trouvées
    let totalWeight = 0;
    let weightedSum = 0;

    for (const [key, lookup] of Object.entries(lookups)) {
        if (lookup !== null) {
            const catScore = rangToScore(lookup.rang, key);
            const weight = CATEGORY_WEIGHTS[key] || 0;
            totalWeight += weight;
            weightedSum += weight * catScore;
        }
    }

    let finalScore = totalWeight > 0 ? weightedSum / totalWeight : 50;

    // ─── Intégrer la forme récente (15% du score si disponible) ───
    const scoreForme = calculerScoreForme(p.performances);
    if (scoreForme !== null) {
        finalScore = finalScore * 0.85 + scoreForme * 0.15;
    }

    // ─── Intégrer le poids porté (bonus/malus ±10%) ───
    // Un cheval plus léger que la moyenne a un avantage
    if (poidsMoyen && p.poids) {
        const poidsNum = parseFloat((p.poids || '').replace(',', '.'));
        if (!isNaN(poidsNum) && poidsNum > 0 && poidsMoyen > 0) {
            const ecartPoids = (poidsMoyen - poidsNum) / poidsMoyen;
            // Clamp l'écart pour éviter des scores aberrants (±15% max d'écart)
            const ecartClamp = Math.max(-0.15, Math.min(0.15, ecartPoids));
            finalScore *= (1 + 0.10 * ecartClamp);
        }
    }

    // Clamp final 0-100
    finalScore = Math.max(0, Math.min(100, finalScore));

    return {
        score: finalScore,
        confidence: hits / 5, // 0.0 → 1.0
        hits: hits,
        forme: scoreForme
    };
}

// ─── P4: Badge de confiance visuel ───
function getConfidenceBadge(confidence) {
    if (confidence >= 0.8) {
        return '<span class="confidence-badge confidence-high" title="Score fiable (4-5 acteurs trouvés dans les rankings)">●●●</span>';
    }
    if (confidence >= 0.4) {
        return '<span class="confidence-badge confidence-mid" title="Score partiel (2-3 acteurs trouvés)">●●○</span>';
    }
    return '<span class="confidence-badge confidence-low" title="Score estimé (0-1 acteur trouvé)">●○○</span>';
}

// ─── Indicateur de forme visuel ───
function getFormeBadge(forme) {
    if (forme === null || forme === undefined) {
        return '<span class="forme-badge" title="Forme inconnue">—</span>';
    }
    if (forme >= 70) {
        return '<span class="forme-badge forme-hot" title="En grande forme (score ' + forme.toFixed(0) + ')">🔥</span>';
    }
    if (forme >= 40) {
        return '<span class="forme-badge forme-ok" title="Forme correcte (score ' + forme.toFixed(0) + ')">👍</span>';
    }
    return '<span class="forme-badge forme-cold" title="Forme faible (score ' + forme.toFixed(0) + ')">❄️</span>';
}

// ─── Main ───
document.addEventListener('DOMContentLoaded', async function() {
    console.log("Course analysis script v3.0 loaded");

    // Éléments DOM
    const hippodromeSelect = document.getElementById('hippodrome-select');
    const courseSelectContainer = document.getElementById('course-select-container');
    const courseSelect = document.getElementById('course-select');
    const courseDetails = document.getElementById('course-details');
    const currentDateElement = document.querySelector('.date-selector span');

    console.log("Éléments DOM récupérés:", {hippodromeSelect, courseSelectContainer, courseSelect, courseDetails});

    // Vérifier si les éléments DOM ont été trouvés
    if (!hippodromeSelect || !courseSelectContainer || !courseSelect || !courseDetails) {
        console.error("Certains éléments DOM n'ont pas été trouvés");
        return;
    }

    // P2: Charger les rankings en parallèle de l'init UI
    const rankingsPromise = loadRankings();

    // Mettre à jour la date avec la date du jour
    function updateCurrentDate() {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();

        if (currentDateElement) {
            currentDateElement.textContent = `${day}/${month}/${year}`;
        }

        // Mettre à jour également la date dans le footer
        const footerDateElement = document.querySelector('footer p');
        if (footerDateElement) {
            footerDateElement.innerHTML = footerDateElement.innerHTML.replace(/\d{2}\/\d{2}\/\d{4}/, `${day}/${month}/${year}`);
        }
    }

    // Initialisation - Peupler le sélecteur d'hippodromes
    function initHippodromeSelect() {
        console.log("Initialisation du sélecteur d'hippodromes");

        // Vider le sélecteur
        hippodromeSelect.innerHTML = '<option value="">Choisir l\'hippodrome</option>';

        // Vérifier que courseData existe
        if (typeof courseData === 'undefined') {
            console.error("courseData n'est pas défini — vérifier que data.js est chargé avant course-analysis.js");
            return;
        }

        // Ajouter les options
        Object.keys(courseData).forEach(hippodrome => {
            const option = document.createElement('option');
            option.value = hippodrome;
            option.textContent = hippodrome;
            hippodromeSelect.appendChild(option);
        });

        console.log("Sélecteur d'hippodromes initialisé avec", Object.keys(courseData).length, "options");
    }

    // Gestionnaire d'événement pour le changement d'hippodrome
    hippodromeSelect.addEventListener('change', function() {
        const selectedHippodrome = this.value;
        console.log("Hippodrome sélectionné:", selectedHippodrome);

        // Réinitialiser l'affichage
        courseDetails.style.display = 'none';

        if (selectedHippodrome) {
            populateCourseSelect(selectedHippodrome);
            courseSelectContainer.style.display = 'block';
        } else {
            courseSelectContainer.style.display = 'none';
        }
    });

    // P1: Peupler le sélecteur de courses avec ID unique
    function populateCourseSelect(hippodrome) {
        console.log("Peuplement du sélecteur de courses pour", hippodrome);

        courseSelect.innerHTML = '<option value="">Choisir une course</option>';

        const courses = courseData[hippodrome];
        if (!courses || courses.length === 0) {
            console.warn("Aucune course trouvée pour cet hippodrome");
            return;
        }

        courses.forEach(course => {
            const option = document.createElement('option');
            option.value = getCourseId(course); // P1: ID unique au lieu de course.nom
            option.textContent = `${course.horaire || '?'} - ${course.nom || 'Sans nom'}`;
            courseSelect.appendChild(option);
        });

        console.log("Sélecteur de courses initialisé avec", courses.length, "options");
    }

    // Gestionnaire d'événement pour le changement de course
    courseSelect.addEventListener('change', async function() {
        const selectedCourseId = this.value;
        const selectedHippodrome = hippodromeSelect.value;

        console.log("Course sélectionnée:", selectedCourseId, "à", selectedHippodrome);

        if (selectedCourseId && selectedHippodrome) {
            // S'assurer que les rankings sont chargés avant d'afficher
            if (!rankingsLoaded) {
                console.log("Attente chargement rankings...");
                await rankingsPromise;
            }
            displayCourseDetails(selectedHippodrome, selectedCourseId);
        } else {
            courseDetails.style.display = 'none';
        }
    });

    // Fonction pour afficher les détails d'une course et son classement théorique
    function displayCourseDetails(hippodrome, courseId) {
        console.log("Affichage des détails pour", courseId, "à", hippodrome);

        // P1: Trouver la course par ID unique
        const courses = courseData[hippodrome];
        if (!courses) {
            console.error("Hippodrome non trouvé:", hippodrome);
            return;
        }
        const course = courses.find(c => getCourseId(c) === courseId);

        if (!course) {
            console.error("Course non trouvée pour ID:", courseId);
            return;
        }

        // Mettre à jour les détails de base (P3: textContent = safe)
        document.getElementById('course-name').textContent = course.nom;
        document.getElementById('meta-hippodrome').textContent = hippodrome;
        document.getElementById('meta-horaire').textContent = course.horaire;
        document.getElementById('meta-type').textContent = course.type || "Plat";
        document.getElementById('meta-participants').textContent = course.participants.length;

        // ─── Calculer le poids moyen du peloton ───
        const poidsValues = course.participants
            .map(rawP => parseFloat((canonicalizeParticipant(rawP).poids || '').replace(',', '.')))
            .filter(v => !isNaN(v) && v > 0);
        const poidsMoyen = poidsValues.length > 0
            ? poidsValues.reduce((a, b) => a + b, 0) / poidsValues.length
            : null;

        if (poidsMoyen) {
            console.log(`Poids moyen du peloton: ${poidsMoyen.toFixed(1)} kg (${poidsValues.length} valeurs)`);
        }

        // ─── Contexte course pour la corde ───
        const courseContext = {
            distance: parseInt(course.distance) || 2000,
            hippodrome: hippodrome
        };

        // P0: Canoniser les participants + P2: Scoring pipeline + Quick wins
        const participantsWithScores = course.participants.map(rawP => {
            const p = canonicalizeParticipant(rawP); // P0
            const result = calculerScoreTheorique(p, poidsMoyen); // P2 + forme + poids

            // ─── Corde : ajustement post-scoring ───
            let cordeAjust = 0;
            let cordeDetail = null;
            if (p.corde && window.rankingLoader && window.rankingLoader.cordeHandler) {
                const cordeNum = window.rankingLoader.cordeHandler.extractCordeNumber(p.corde);
                if (cordeNum !== null) {
                    const cordeImpact = window.rankingLoader.cordeHandler.calculateCordeImpact(cordeNum, courseContext);
                    cordeAjust = cordeImpact.score || 0;
                    cordeDetail = cordeImpact.explication || null;
                }
            }

            const scoreFinal = Math.max(0, Math.min(100, result.score + cordeAjust));

            return {
                ...p,
                score: scoreFinal,
                confidence: result.confidence,
                hits: result.hits,
                forme: result.forme,
                cordeAjust: cordeAjust,
                cordeDetail: cordeDetail
            };
        });

        // Trier par score décroissant
        participantsWithScores.sort((a, b) => b.score - a.score);

        // Mettre à jour le tableau de classement
        updateRankingTable(participantsWithScores);

        // Afficher les détails
        courseDetails.style.display = 'block';
        courseDetails.scrollIntoView({ behavior: 'smooth' });
    }

    // Fonction pour mettre à jour le tableau de classement
    function updateRankingTable(participants) {
        console.log("Mise à jour du tableau avec", participants.length, "participants");

        const rankingTableBody = document.getElementById('ranking-table-body');
        if (!rankingTableBody) {
            console.error("Élément ranking-table-body non trouvé");
            return;
        }

        rankingTableBody.innerHTML = '';

        // Styles CSS (injectés une seule fois)
        if (!document.getElementById('ranking-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'ranking-styles';
            styleSheet.textContent = `
                .position-badge {
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    background-color: var(--medium-teal);
                    color: var(--light-gold);
                    font-weight: 600;
                    margin: 0 auto;
                }
                .position-badge.top-1 {
                    background-color: gold;
                    color: var(--dark-teal);
                    box-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
                }
                .position-badge.top-2 {
                    background-color: silver;
                    color: var(--dark-teal);
                    box-shadow: 0 0 8px rgba(192, 192, 192, 0.5);
                }
                .position-badge.top-3 {
                    background-color: #cd7f32;
                    color: var(--dark-teal);
                    box-shadow: 0 0 8px rgba(205, 127, 50, 0.5);
                }
                .score-display {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .score-bar {
                    flex: 1;
                    height: 8px;
                    background-color: rgba(255, 255, 255, 0.1);
                    border-radius: 4px;
                    overflow: hidden;
                }
                .score-fill {
                    height: 100%;
                    background: linear-gradient(to right, var(--accent), var(--gold));
                    border-radius: 4px;
                }
                .score-value {
                    font-weight: 600;
                    color: var(--accent);
                    min-width: 40px;
                    text-align: right;
                }
                .confidence-badge {
                    font-size: 0.7rem;
                    margin-left: 4px;
                    cursor: help;
                }
                .confidence-high { color: #4caf50; }
                .confidence-mid  { color: #ff9800; }
                .confidence-low  { color: #f44336; }
                .forme-badge {
                    font-size: 0.85rem;
                    margin-left: 4px;
                    cursor: help;
                }
            `;
            document.head.appendChild(styleSheet);
        }

        // Ajouter les participants (P3: escapeHtml sur toutes les données injectées)
        participants.forEach((p, index) => {
            const position = index + 1;
            const row = document.createElement('tr');
            const positionClass = position <= 3 ? `top-${position}` : '';
            const normalizedScore = Math.min(100, Math.max(0, p.score));

            // P3+P4: innerHTML avec données échappées + badge confiance + forme
            row.innerHTML = `
                <td><div class="position-badge ${positionClass}">${position}</div></td>
                <td>${escapeHtml(p.cheval)}</td>
                <td>${escapeHtml(p.jockey)}</td>
                <td>
                    <div class="score-display">
                        <div class="score-bar">
                            <div class="score-fill" style="width: ${normalizedScore}%"></div>
                        </div>
                        <span class="score-value">${p.score.toFixed(1)}</span>
                        ${getConfidenceBadge(p.confidence)}
                        ${getFormeBadge(p.forme)}
                    </div>
                </td>
                <td>
                    <button class="detail-btn" data-cheval="${escapeHtml(p.cheval)}" data-jockey="${escapeHtml(p.jockey)}" data-entraineur="${escapeHtml(p.entraineur)}" data-hits="${p.hits}" data-confidence="${(p.confidence * 100).toFixed(0)}" data-forme="${p.forme !== null ? p.forme.toFixed(0) : 'N/A'}" data-corde="${p.cordeDetail || 'Non disponible'}" data-poids="${escapeHtml(p.poids)}">
                        <i class="fas fa-info-circle"></i>
                    </button>
                </td>
            `;

            rankingTableBody.appendChild(row);
        });

        // Gestionnaires d'événements pour les boutons de détail
        document.querySelectorAll('.detail-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const hits = this.dataset.hits;
                const confidence = this.dataset.confidence;
                const forme = this.dataset.forme;
                const corde = this.dataset.corde;
                const poids = this.dataset.poids;
                alert(
                    `Détails pour ${this.dataset.cheval}\n` +
                    `Jockey: ${this.dataset.jockey}\n` +
                    `Entraîneur: ${this.dataset.entraineur}\n` +
                    `─────────────────\n` +
                    `Confiance: ${confidence}% (${hits}/5 acteurs trouvés)\n` +
                    `Forme récente: ${forme}\n` +
                    `Poids: ${poids}\n` +
                    `Corde: ${corde}`
                );
            });
        });
    }

    // ─── Initialisation ───
    updateCurrentDate();
    initHippodromeSelect();
    console.log("Initialisation UI terminée, rankings en cours de chargement...");
});
