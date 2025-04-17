// Chargeur dynamique des données de courses
const coursesLoader = {
    // URL de base pour les fichiers de courses
    baseUrl: 'https://raw.githubusercontent.com/bencode92/Hippique/main/data/courses/',
    
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
            
            // Requête pour récupérer la liste des fichiers qui commencent par la date
            const response = await fetch(`https://api.github.com/repos/bencode92/Hippique/contents/data`);
            if (!response.ok) {
                throw new Error(`Erreur lors de la récupération des fichiers: ${response.status}`);
            }
            
            const files = await response.json();
            
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
                    const fileResponse = await fetch(file.download_url);
                    if (!fileResponse.ok) {
                        console.error(`Erreur lors du chargement du fichier ${file.name}: ${fileResponse.status}`);
                        continue;
                    }
                    
                    const fileData = await fileResponse.json();
                    
                    // Vérifier si le fichier contient un hippodrome 
                    // et des courses de type "plat" seulement
                    if (fileData.hippodrome && fileData.courses) {
                        // Filtrer pour n'inclure que les courses de type "plat" (insensible à la casse)
                        const platCourses = fileData.courses.filter(course => 
                            course.type && course.type.toLowerCase() === "plat"
                        );
                        
                        // N'ajouter l'hippodrome que s'il a des courses de type "plat"
                        if (platCourses.length > 0) {
                            courseData[fileData.hippodrome] = platCourses;
                        }
                    }
                } catch (fileError) {
                    console.error(`Erreur lors du traitement du fichier ${file.name}:`, fileError);
                }
            }
            
            console.log("Données de courses chargées avec succès:", courseData);
            return courseData;
            
        } catch (error) {
            console.error("Erreur lors du chargement des courses:", error);
            return {};
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
