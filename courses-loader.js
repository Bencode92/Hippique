// Chargeur dynamique des données de courses
const coursesLoader = {
    // Récupérer la liste des courses pour une date spécifique
    async loadCoursesForDate(dateStr) {
        console.log(`Chargement des courses pour la date ${dateStr}`);
        
        // Format de date attendu: YYYY-MM-DD (ex: 2025-04-17)
        if (!dateStr) {
            const today = new Date();
            dateStr = this.formatDateYMD(today);
        }
        
        try {
            // Initialiser l'objet courseData
            const courseData = {};
            
            // Chemin correct vers les fichiers de courses
            console.log("Tentative de récupération des fichiers dans le répertoire 'data/courses'");
            let response = await fetch(`https://api.github.com/repos/bencode92/Hippique/contents/data/courses`);
            
            if (!response.ok) {
                console.error(`Erreur lors de la récupération des fichiers: ${response.status}`);
                console.error(`Essai de déboguer: récupération du contenu du répertoire 'data'`);
                
                // Essayer de lister le contenu du répertoire parent
                const dataResponse = await fetch(`https://api.github.com/repos/bencode92/Hippique/contents/data`);
                if (dataResponse.ok) {
                    const dataContent = await dataResponse.json();
                    console.log("Contenu du répertoire 'data':", dataContent);
                }
                
                throw new Error(`Impossible d'accéder au répertoire data/courses: ${response.status}`);
            }
            
            const files = await response.json();
            console.log("Fichiers trouvés dans data/courses:", files);
            
            // Filtrer pour trouver tous les fichiers JSON correspondant à la date
            const courseFiles = files.filter(file => 
                file.name.startsWith(dateStr) && 
                file.name.endsWith('.json')
            );
            
            console.log(`Fichiers de courses trouvés pour ${dateStr}:`, courseFiles);
            
            // Si aucun fichier trouvé, retourner objet vide
            if (courseFiles.length === 0) {
                console.warn(`Aucun fichier de course trouvé pour la date ${dateStr}`);
                return courseData;
            }
            
            // Charger les données de chaque fichier
            for (const file of courseFiles) {
                try {
                    await this.processFile(file, courseData);
                } catch (fileError) {
                    console.error(`Erreur lors du traitement du fichier ${file.name}:`, fileError);
                }
            }
            
            console.log("Données de courses chargées avec succès:", courseData);
            return courseData;
            
        } catch (error) {
            console.error("Erreur lors du chargement des courses:", error);
            // Afficher une erreur utilisateur
            alert(`Erreur lors du chargement des courses: ${error.message}. Vérifiez la console pour plus de détails.`);
            return {};
        }
    },
    
    // Traiter un fichier JSON
    async processFile(file, courseData) {
        console.log(`Traitement du fichier: ${file.name}, URL: ${file.download_url}`);
        
        const fileResponse = await fetch(file.download_url);
        if (!fileResponse.ok) {
            console.error(`Erreur lors du chargement du fichier ${file.name}: ${fileResponse.status}`);
            return;
        }
        
        try {
            const fileData = await fileResponse.json();
            console.log(`Structure du fichier ${file.name}:`, Object.keys(fileData));
            
            // Détecter automatiquement la structure du fichier
            if (fileData.hippodrome) {
                // Format standard avec hippodrome et courses
                console.log(`Fichier ${file.name} contient l'hippodrome: ${fileData.hippodrome}`);
                
                // Vérifier si 'courses' existe et est un tableau
                if (fileData.courses && Array.isArray(fileData.courses)) {
                    // Filtrer pour ne garder que les courses de type "plat" (insensible à la casse)
                    const platCourses = fileData.courses.filter(course => 
                        !course.type || course.type.toLowerCase() === "plat"
                    );
                    
                    if (platCourses.length > 0) {
                        courseData[fileData.hippodrome] = platCourses;
                        console.log(`Ajout de ${platCourses.length} courses pour l'hippodrome ${fileData.hippodrome}`);
                    }
                }
            } else {
                // Essayer de déterminer dynamiquement le nom de l'hippodrome depuis le nom du fichier
                const filename = file.name;
                // Extraire le nom de l'hippodrome du nom de fichier (après la date)
                const match = filename.match(/\d{4}-\d{2}-\d{2}_(.+)\.json$/);
                
                if (match && match[1]) {
                    const hippodromeName = match[1].toUpperCase().replace(/_/g, ' ');
                    console.log(`Nom d'hippodrome extrait du fichier: ${hippodromeName}`);
                    
                    // Vérifier si le contenu est déjà un tableau
                    if (Array.isArray(fileData)) {
                        const platCourses = fileData.filter(course => 
                            !course.type || course.type.toLowerCase() === "plat"
                        );
                        
                        if (platCourses.length > 0) {
                            courseData[hippodromeName] = platCourses;
                            console.log(`Ajout de ${platCourses.length} courses pour l'hippodrome ${hippodromeName}`);
                        }
                    } else {
                        // Si le contenu est directement l'objet de course individuel
                        if (!fileData.type || fileData.type.toLowerCase() === "plat") {
                            courseData[hippodromeName] = [fileData];
                            console.log(`Ajout d'une course pour l'hippodrome ${hippodromeName}`);
                        }
                    }
                } else {
                    console.warn(`Impossible de déterminer l'hippodrome pour le fichier ${filename}`);
                }
            }
        } catch (jsonError) {
            console.error(`Erreur lors de l'analyse JSON du fichier ${file.name}:`, jsonError);
            // Essayer de charger le contenu en texte brut pour déboguer
            const textContent = await fileResponse.text();
            console.log(`Contenu brut du fichier ${file.name} (premiers 200 caractères):`, textContent.substring(0, 200));
        }
    },
    
    // Formater une date au format YYYY-MM-DD
    formatDateYMD(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },
    
    // Formatter la date au format affichable (DD/MM/YYYY)
    formatDateDMY(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    },
    
    // Obtenir une date lisible (aujourd'hui, demain, etc.)
    getReadableDate(date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const dateToCheck = new Date(date);
        dateToCheck.setHours(0, 0, 0, 0);
        
        if (dateToCheck.getTime() === today.getTime()) {
            return `Aujourd'hui (${this.formatDateDMY(date)})`;
        } else if (dateToCheck.getTime() === tomorrow.getTime()) {
            return `Demain (${this.formatDateDMY(date)})`;
        } else {
            return this.formatDateDMY(date);
        }
    }
};
