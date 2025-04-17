// Script pour la gestion du sélecteur de course et l'affichage du classement théorique
document.addEventListener('DOMContentLoaded', function() {
    // Éléments DOM
    const hippodromeSelect = document.getElementById('hippodrome-select');
    const courseSelectContainer = document.getElementById('course-select-container');
    const courseSelect = document.getElementById('course-select');
    const courseDetails = document.getElementById('course-details');
    const courseName = document.getElementById('course-name');
    const metaHippodrome = document.getElementById('meta-hippodrome');
    const metaHoraire = document.getElementById('meta-horaire');
    const metaType = document.getElementById('meta-type');
    const metaParticipants = document.getElementById('meta-participants');
    const rankingTableBody = document.getElementById('ranking-table-body');
    
    // Référence à la modale (sera créée dynamiquement)
    let horseModal;
    
    // Initialisation - Peupler le sélecteur d'hippodromes
    function initHippodromeSelect() {
        // Vider le sélecteur
        hippodromeSelect.innerHTML = '<option value="">Choisir l\'hippodrome</option>';
        
        // Ajouter les options
        Object.keys(courseData).forEach(hippodrome => {
            const option = document.createElement('option');
            option.value = hippodrome;
            option.textContent = hippodrome;
            hippodromeSelect.appendChild(option);
        });
    }
    
    // Gestionnaire d'événement pour le changement d'hippodrome
    hippodromeSelect.addEventListener('change', function() {
        const selectedHippodrome = this.value;
        
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
        // Vider le sélecteur
        courseSelect.innerHTML = '<option value="">Choisir une course</option>';
        
        // Ajouter les options
        courseData[hippodrome].forEach(course => {
            const option = document.createElement('option');
            option.value = course.nom;
            option.textContent = `${course.horaire} - ${course.nom}`;
            courseSelect.appendChild(option);
        });
    }
    
    // Gestionnaire d'événement pour le changement de course
    courseSelect.addEventListener('change', function() {
        const selectedCourse = this.value;
        const selectedHippodrome = hippodromeSelect.value;
        
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
        // Trouver la course dans les données
        const course = courseData[hippodrome].find(c => c.nom === courseName);
        
        if (!course) return;
        
        // Mettre à jour les détails
        document.getElementById('course-name').textContent = course.nom;
        metaHippodrome.textContent = hippodrome;
        metaHoraire.textContent = course.horaire;
        metaType.textContent = course.type;
        metaParticipants.textContent = course.participants.length;
        
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
        // Vider le tableau
        rankingTableBody.innerHTML = '';
        
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
                    <button class="detail-btn" data-cheval="${p.cheval}">
                        <i class="fas fa-info-circle"></i>
                    </button>
                </td>
            `;
            
            rankingTableBody.appendChild(row);
        });
        
        // Ajouter les gestionnaires d'événements pour les boutons de détail
        document.querySelectorAll('.detail-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const chevalName = this.dataset.cheval;
                const participant = participants.find(p => p.cheval === chevalName);
                showHorseDetails(participant, participants);
            });
        });
    }
    
    // Fonction pour afficher les détails d'un cheval dans une modale
    function showHorseDetails(horse, allParticipants) {
        // Créer la modale si elle n'existe pas
        if (!horseModal) {
            horseModal = document.createElement('div');
            horseModal.className = 'horse-modal';
            document.body.appendChild(horseModal);
            
            // Ajouter le gestionnaire pour fermer au clic en dehors
            horseModal.addEventListener('click', function(e) {
                if (e.target === horseModal) {
                    horseModal.classList.remove('show');
                }
            });
        }
        
        // Position dans le classement
        const position = allParticipants.findIndex(p => p.cheval === horse.cheval) + 1;
        
        // Extraire les données de classement
        const chevalData = classementData.chevaux[horse.cheval] || { score: 50, rang: 'N/A' };
        const jockeyData = classementData.jockeys[horse.jockey] || { score: 50, rang: 'N/A' };
        const entraineurData = classementData.entraineurs[horse.entraineur] || { score: 50, rang: 'N/A' };
        const eleveursData = classementData.eleveurs[horse.eleveurs] || { score: 50, rang: 'N/A' };
        const proprietaireData = classementData.proprietaires[horse.proprietaire] || { score: 50, rang: 'N/A' };
        
        // Calculer les contributions pondérées
        const chevalContribution = 0.55 * chevalData.score;
        const jockeyContribution = 0.15 * jockeyData.score;
        const entraineurContribution = 0.12 * entraineurData.score;
        const eleveursContribution = 0.10 * eleveursData.score;
        const proprietaireContribution = 0.08 * proprietaireData.score;
        
        // Calculer la contribution relative de chaque facteur (en pourcentage)
        const totalContribution = chevalContribution + jockeyContribution + entraineurContribution + 
                                 eleveursContribution + proprietaireContribution;
                                 
        const chevalPercent = (chevalContribution / totalContribution) * 100;
        const jockeyPercent = (jockeyContribution / totalContribution) * 100;
        const entraineurPercent = (entraineurContribution / totalContribution) * 100;
        const eleveursPercent = (eleveursContribution / totalContribution) * 100;
        const proprietairePercent = (proprietaireContribution / totalContribution) * 100;
        
        // Remplir la modale
        horseModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-close"><i class="fas fa-times"></i></div>
                <h3>${horse.cheval}</h3>
                <p style="margin-bottom: 1rem;">Position dans le classement théorique: <strong>${position}</strong></p>
                
                <h4 style="color: var(--gold); margin: 1.5rem 0 0.75rem;">Facteurs de performance</h4>
                
                <div class="factor-grid">
                    <div class="factor-card">
                        <h4><i class="fas fa-horse"></i> Cheval</h4>
                        <div class="factor-bar">
                            <div class="factor-fill cheval-fill" style="width: ${chevalData.score}%"></div>
                        </div>
                        <div class="factor-details">
                            <span>Score: ${chevalData.score}</span>
                            <span class="factor-weight">Poids: 55%</span>
                        </div>
                        <p style="margin-top: 0.5rem; font-size: 0.85rem;">Classement global: <strong>${chevalData.rang}</strong></p>
                    </div>
                    
                    <div class="factor-card">
                        <h4><i class="fas fa-user"></i> Jockey</h4>
                        <div class="factor-bar">
                            <div class="factor-fill jockey-fill" style="width: ${jockeyData.score}%"></div>
                        </div>
                        <div class="factor-details">
                            <span>Score: ${jockeyData.score}</span>
                            <span class="factor-weight">Poids: 15%</span>
                        </div>
                        <p style="margin-top: 0.5rem; font-size: 0.85rem;">Classement global: <strong>${jockeyData.rang}</strong></p>
                    </div>
                    
                    <div class="factor-card">
                        <h4><i class="fas fa-users"></i> Entraineur</h4>
                        <div class="factor-bar">
                            <div class="factor-fill entraineur-fill" style="width: ${entraineurData.score}%"></div>
                        </div>
                        <div class="factor-details">
                            <span>Score: ${entraineurData.score}</span>
                            <span class="factor-weight">Poids: 12%</span>
                        </div>
                        <p style="margin-top: 0.5rem; font-size: 0.85rem;">Classement global: <strong>${entraineurData.rang}</strong></p>
                    </div>
                    
                    <div class="factor-card">
                        <h4><i class="fas fa-seedling"></i> Éleveur</h4>
                        <div class="factor-bar">
                            <div class="factor-fill eleveur-fill" style="width: ${eleveursData.score}%"></div>
                        </div>
                        <div class="factor-details">
                            <span>Score: ${eleveursData.score}</span>
                            <span class="factor-weight">Poids: 10%</span>
                        </div>
                        <p style="margin-top: 0.5rem; font-size: 0.85rem;">Classement global: <strong>${eleveursData.rang}</strong></p>
                    </div>
                    
                    <div class="factor-card">
                        <h4><i class="fas fa-briefcase"></i> Propriétaire</h4>
                        <div class="factor-bar">
                            <div class="factor-fill proprietaire-fill" style="width: ${proprietaireData.score}%"></div>
                        </div>
                        <div class="factor-details">
                            <span>Score: ${proprietaireData.score}</span>
                            <span class="factor-weight">Poids: 8%</span>
                        </div>
                        <p style="margin-top: 0.5rem; font-size: 0.85rem;">Classement global: <strong>${proprietaireData.rang}</strong></p>
                    </div>
                </div>
                
                <h4 style="color: var(--gold); margin: 1.5rem 0 0.75rem;">Contribution au score final (${horse.score.toFixed(1)})</h4>
                
                <div class="contributions-chart">
                    <div class="contribution-item">
                        <span class="contribution-label">Cheval (55%)</span>
                        <div class="contribution-bar-container">
                            <div class="contribution-bar cheval-fill" style="width: ${chevalPercent}%"></div>
                        </div>
                        <span class="contribution-value">+${chevalContribution.toFixed(1)} pts</span>
                    </div>
                    
                    <div class="contribution-item">
                        <span class="contribution-label">Jockey (15%)</span>
                        <div class="contribution-bar-container">
                            <div class="contribution-bar jockey-fill" style="width: ${jockeyPercent}%"></div>
                        </div>
                        <span class="contribution-value">+${jockeyContribution.toFixed(1)} pts</span>
                    </div>
                    
                    <div class="contribution-item">
                        <span class="contribution-label">Entraineur (12%)</span>
                        <div class="contribution-bar-container">
                            <div class="contribution-bar entraineur-fill" style="width: ${entraineurPercent}%"></div>
                        </div>
                        <span class="contribution-value">+${entraineurContribution.toFixed(1)} pts</span>
                    </div>
                    
                    <div class="contribution-item">
                        <span class="contribution-label">Éleveur (10%)</span>
                        <div class="contribution-bar-container">
                            <div class="contribution-bar eleveur-fill" style="width: ${eleveursPercent}%"></div>
                        </div>
                        <span class="contribution-value">+${eleveursContribution.toFixed(1)} pts</span>
                    </div>
                    
                    <div class="contribution-item">
                        <span class="contribution-label">Propriétaire (8%)</span>
                        <div class="contribution-bar-container">
                            <div class="contribution-bar proprietaire-fill" style="width: ${proprietairePercent}%"></div>
                        </div>
                        <span class="contribution-value">+${proprietaireContribution.toFixed(1)} pts</span>
                    </div>
                </div>
                
                <div style="margin-top: 1.5rem;">
                    <h4 style="color: var(--gold); margin-bottom: 0.75rem;">Informations supplémentaires</h4>
                    <p><strong>Poids:</strong> ${horse.poids}</p>
                    <p><strong>Performances récentes:</strong> ${horse.performances || "Aucune information"}</p>
                </div>
                
                <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                    <a href="courses.html" class="btn-primary" style="flex: 1; text-align: center; text-decoration: none;">
                        <i class="fas fa-chart-line"></i> Analyse détaillée
                    </a>
                    <a href="simulation.html" class="btn-primary" style="flex: 1; text-align: center; text-decoration: none;">
                        <i class="fas fa-calculator"></i> Simuler un pari
                    </a>
                </div>
            </div>
        `;
        
        // Afficher la modale
        horseModal.classList.add('show');
        
        // Ajouter le gestionnaire pour le bouton de fermeture
        const closeBtn = horseModal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                horseModal.classList.remove('show');
            });
        }
    }
    
    // Initialiser les sélecteurs
    initHippodromeSelect();
});