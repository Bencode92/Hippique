// Script pour la gestion du sélecteur de course et l'affichage du classement théorique
// v2.0 — Branchement pipeline rankings pondérés + fixes P0-P5

// ─── Rankings data (chargé au démarrage via loadRankings) ───
let rankingsData = {
    chevaux: {},
    jockeys: {},
    entraineurs: {},
    eleveurs: {},
    proprietaires: {}
};
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
            console.log(`✅ Rankings ${cat}: ${Object.keys(map).length} entrées`);
        } catch (e) {
            console.warn(`⚠️ Rankings ${cat} indisponibles:`, e.message);
        }
    });
    await Promise.all(promises);
    rankingsLoaded = true;
    console.log('Rankings chargés:', Object.entries(rankingsData).map(([k,v]) => `${k}:${Object.keys(v).length}`).join(', '));
}

// ─── P2: Scoring basé sur les rankings pipeline (remplace l'ancien hardcodé) ───
// Pondération inter-catégories: cheval 50%, jockey 30%, entraîneur 10%, éleveur 5%, propriétaire 5%
// Note: le pipeline utilise 50/30/20 (victoires/tauxV/tauxP) INTRA-catégorie pour construire ScoreMixte.
// Ici on pondère l'importance relative des catégories pour le scoring d'un participant.
const CATEGORY_WEIGHTS = {
    cheval: 0.50,
    jockey: 0.30,
    entraineur: 0.10,
    eleveur: 0.05,
    proprietaire: 0.05
};

function calculerScoreTheorique(p) {
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
        const normalizedFallback = Math.min(100, Math.max(0, 50 + (fallbackScore - 30) * 1.5));
        return { score: normalizedFallback, confidence: 0, hits: 0 };
    }

    // Calculer score par catégorie: inversé du rang (plus petit rang = meilleur)
    // On normalise: score = max(0, 100 - (rang - 1) * 0.5)
    // Cela donne ~100 pour rang 1, ~75 pour rang 50, ~50 pour rang 100
    function rangToScore(rang) {
        return Math.max(0, Math.min(100, 100 - (rang - 1) * 0.5));
    }

    // Pondération dynamique: ne compter que les composantes trouvées
    let totalWeight = 0;
    let weightedSum = 0;

    for (const [key, lookup] of Object.entries(lookups)) {
        if (lookup !== null) {
            const catScore = rangToScore(lookup.rang);
            const weight = CATEGORY_WEIGHTS[key] || 0;
            totalWeight += weight;
            weightedSum += weight * catScore;
        }
    }

    const finalScore = totalWeight > 0 ? weightedSum / totalWeight : 50;

    return {
        score: finalScore,
        confidence: hits / 5, // 0.0 → 1.0
        hits: hits
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

// ─── Main ───
document.addEventListener('DOMContentLoaded', async function() {
    console.log("Course analysis script v2.0 loaded");

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

        // P0: Canoniser les participants + P2: Scoring pipeline
        const participantsWithScores = course.participants.map(rawP => {
            const p = canonicalizeParticipant(rawP); // P0
            const result = calculerScoreTheorique(p); // P2
            return { ...p, score: result.score, confidence: result.confidence, hits: result.hits };
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
            `;
            document.head.appendChild(styleSheet);
        }

        // Ajouter les participants (P3: escapeHtml sur toutes les données injectées)
        participants.forEach((p, index) => {
            const position = index + 1;
            const row = document.createElement('tr');
            const positionClass = position <= 3 ? `top-${position}` : '';
            const normalizedScore = Math.min(100, Math.max(0, p.score));

            // P3+P4: innerHTML avec données échappées + badge confiance
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
                    </div>
                </td>
                <td>
                    <button class="detail-btn" data-cheval="${escapeHtml(p.cheval)}" data-jockey="${escapeHtml(p.jockey)}" data-entraineur="${escapeHtml(p.entraineur)}" data-hits="${p.hits}" data-confidence="${(p.confidence * 100).toFixed(0)}">
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
                alert(
                    `Détails pour ${this.dataset.cheval}\n` +
                    `Jockey: ${this.dataset.jockey}\n` +
                    `Entraîneur: ${this.dataset.entraineur}\n` +
                    `─────────────────\n` +
                    `Confiance: ${confidence}% (${hits}/5 acteurs trouvés dans les rankings)`
                );
            });
        });
    }

    // ─── Initialisation ───
    updateCurrentDate();
    initHippodromeSelect();
    console.log("Initialisation UI terminée, rankings en cours de chargement...");
});
