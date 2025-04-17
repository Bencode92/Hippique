// Script pour la gestion du sélecteur de course et l'affichage du classement théorique
document.addEventListener('DOMContentLoaded', function() {
    console.log("Course analysis script loaded");
    
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
        return; // Sortir de la fonction si des éléments essentiels manquent
    }

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
        
        // Ajouter les options
        Object.keys(courseData).forEach(hippodrome => {
            const option = document.createElement('option');
            option.value = hippodrome;
            option.textContent = hippodrome;
            hippodromeSelect.appendChild(option);
        });
        
        console.log("Sélecteur d'hippodromes initialisé avec", Object.keys(courseData).length, "options");
    }
    
    // Fonction pour calculer le score théorique d'un participant
    function calculerScoreTheorique(cheval, jockey, entraineur, eleveur, proprietaire) {
        // Récupérer les scores des acteurs ou utiliser la fonction depuis data.js si disponible
        if (window.calculerScoreTheorique) {
            return window.calculerScoreTheorique(cheval, jockey, entraineur, eleveur, proprietaire);
        }
        
        // Version de secours si la fonction n'est pas disponible dans data.js
        // Scores moyens pour chaque catégorie
        const scoresMoyens = {
            chevaux: 75,
            jockeys: 70,
            entraineurs: 72,
            eleveurs: 68,
            proprietaires: 65
        };
        
        // Scores pour quelques acteurs connus
        const scoresSpecifiques = {
            chevaux: {
                "CHARMING CAT": 85,
                "THE BLACK STONE": 82,
                "HELLO SPRING": 79,
                "FRAGANCE": 76,
                "FINK PLOYD": 84,
                "BLACK TIE": 86,
                "NELLO": 77,
                "GALACTIC STAR": 92, 
                "SWIFT VICTORY": 90,
                "ROYAL DESTINY": 91,
                "DIAMOND LIGHT": 89
            },
            jockeys: {
                "HUGO BESNIER": 78,
                "ALEJANDRO GUTIERREZ VAL": 72,
                "DAVID BREUX": 70,
                "MME MICKAELLE MICHEL": 82,
                "VALENTIN SEGUY": 75,
                "JEAN-BERNARD EYQUEM": 84,
                "CHRISTOPHE SOUMILLON": 92,
                "MAXIME GUYON": 90,
                "STEPHANE PASQUIER": 85,
                "PIERRE-CHARLES BOUDOT": 89
            },
            entraineurs: {
                "P. COTTIER": 75,
                "MME J. SOUBAGNE": 72,
                "T. RICHARD (S)": 76,
                "JPJ. DUBOIS": 84,
                "J. REYNIER (S)": 82,
                "JC. ROUGET (S)": 88,
                "A. FABRE (S)": 92,
                "F. HEAD (S)": 86,
                "C. LAFFON-PARIAS": 83
            }
        };
        
        // Récupérer les scores des acteurs
        const scoreCheval = scoresSpecifiques.chevaux[cheval] || scoresMoyens.chevaux;
        const scoreJockey = scoresSpecifiques.jockeys[jockey] || scoresMoyens.jockeys;
        const scoreEntraineur = scoresSpecifiques.entraineurs[entraineur] || scoresMoyens.entraineurs;
        const scoreEleveur = scoresMoyens.eleveurs; // Score moyen pour les éleveurs
        const scoreProprietaire = scoresMoyens.proprietaires; // Score moyen pour les propriétaires
        
        // Appliquer la pondération
        return (
            0.55 * scoreCheval +
            0.15 * scoreJockey +
            0.12 * scoreEntraineur +
            0.10 * scoreEleveur +
            0.08 * scoreProprietaire
        );
    }
    
    // Gestionnaire d'événement pour le changement d'hippodrome
    hippodromeSelect.addEventListener('change', function() {
        const selectedHippodrome = this.value;
        console.log("Hippodrome sélectionné:", selectedHippodrome);
        
        // Réinitialiser l'affichage
        courseDetails.style.display = 'none';
        
        if (selectedHippodrome) {
            // Peupler le sélecteur de courses
            populateCourseSelect(selectedHippodrome);
            
            // Afficher le sélecteur de courses
            courseSelectContainer.style.display = 'block';
        } else {
            // Masquer le sélecteur de courses
            courseSelectContainer.style.display = 'none';
        }
    });
    
    // Fonction pour peupler le sélecteur de courses
    function populateCourseSelect(hippodrome) {
        console.log("Peuplement du sélecteur de courses pour", hippodrome);
        
        // Vider le sélecteur
        courseSelect.innerHTML = '<option value="">Choisir une course</option>';
        
        // Récupérer les courses pour cet hippodrome
        const courses = courseData[hippodrome];
        if (!courses || courses.length === 0) {
            console.warn("Aucune course trouvée pour cet hippodrome");
            return;
        }
        
        // Ajouter les options
        courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.nom;
            option.textContent = `${course.horaire} - ${course.nom}`;
            courseSelect.appendChild(option);
        });
        
        console.log("Sélecteur de courses initialisé avec", courses.length, "options");
    }
    
    // Gestionnaire d'événement pour le changement de course
    courseSelect.addEventListener('change', function() {
        const selectedCourse = this.value;
        const selectedHippodrome = hippodromeSelect.value;
        
        console.log("Course sélectionnée:", selectedCourse, "à", selectedHippodrome);
        
        if (selectedCourse && selectedHippodrome) {
            // Afficher les détails de la course
            displayCourseDetails(selectedHippodrome, selectedCourse);
        } else {
            // Masquer les détails
            courseDetails.style.display = 'none';
        }
    });
    
    // Fonction pour afficher les détails d'une course et son classement théorique
    function displayCourseDetails(hippodrome, courseName) {
        console.log("Affichage des détails pour", courseName, "à", hippodrome);
        
        // Trouver la course dans les données
        const course = courseData[hippodrome].find(c => c.nom === courseName);
        
        if (!course) {
            console.error("Course non trouvée");
            return;
        }
        
        // Mettre à jour les détails de base
        document.getElementById('course-name').textContent = course.nom;
        document.getElementById('meta-hippodrome').textContent = hippodrome;
        document.getElementById('meta-horaire').textContent = course.horaire;
        document.getElementById('meta-type').textContent = course.type || "Plat";
        document.getElementById('meta-participants').textContent = course.participants.length;
        
        // Calculer les scores théoriques pour chaque participant
        const participantsWithScores = course.participants.map(p => {
            const score = calculerScoreTheorique(
                p.cheval, 
                p.jockey, 
                p.entraineur, 
                p.eleveurs, 
                p.proprietaire
            );
            
            return { ...p, score };
        });
        
        // Trier par score décroissant
        participantsWithScores.sort((a, b) => b.score - a.score);
        
        // Mettre à jour le tableau de classement
        updateRankingTable(participantsWithScores);
        
        // Afficher les détails
        courseDetails.style.display = 'block';
        
        // Faire défiler jusqu'aux détails
        courseDetails.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Fonction pour mettre à jour le tableau de classement
    function updateRankingTable(participants) {
        console.log("Mise à jour du tableau avec", participants.length, "participants");
        
        // Récupérer le tbody du tableau
        const rankingTableBody = document.getElementById('ranking-table-body');
        if (!rankingTableBody) {
            console.error("Élément ranking-table-body non trouvé");
            return;
        }
        
        // Vider le tableau
        rankingTableBody.innerHTML = '';
        
        // Styles CSS pour les badges de position et barres de score
        if (!document.getElementById('ranking-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'ranking-styles';
            styleSheet.innerHTML = `
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
                    background-color: #cd7f32; /* Bronze */
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
            `;
            document.head.appendChild(styleSheet);
        }
        
        // Ajouter les participants
        participants.forEach((p, index) => {
            const position = index + 1;
            const row = document.createElement('tr');
            
            // Classe spéciale pour les 3 premiers
            const positionClass = position <= 3 ? `top-${position}` : '';
            
            // Normaliser le score (0-100)
            const normalizedScore = Math.min(100, Math.max(0, p.score));
            
            row.innerHTML = `
                <td><div class="position-badge ${positionClass}">${position}</div></td>
                <td>${p.cheval}</td>
                <td>${p.jockey}</td>
                <td>
                    <div class="score-display">
                        <div class="score-bar">
                            <div class="score-fill" style="width: ${normalizedScore}%"></div>
                        </div>
                        <span class="score-value">${p.score.toFixed(1)}</span>
                    </div>
                </td>
                <td>
                    <button class="detail-btn" data-cheval="${p.cheval}" data-jockey="${p.jockey}" data-entraineur="${p.entraineur}">
                        <i class="fas fa-info-circle"></i>
                    </button>
                </td>
            `;
            
            rankingTableBody.appendChild(row);
        });
        
        // Ajouter les gestionnaires d'événements pour les boutons de détail
        document.querySelectorAll('.detail-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                alert(`Détails pour ${this.dataset.cheval}\nJockey: ${this.dataset.jockey}\nEntraîneur: ${this.dataset.entraineur}`);
            });
        });
    }
    
    // Initialiser les sélecteurs et la date
    updateCurrentDate();
    initHippodromeSelect();
    console.log("Initialisation terminée");
});
