import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import time
import json
import os
import traceback
from datetime import datetime, timedelta

class ScraperCoursesFG:
    def __init__(self):
        self.base_url = "https://www.france-galop.com"
        self.courses_url = f"{self.base_url}/fr/courses/aujourd'hui"  # URL modifiée pour la page des courses du jour
        self.output_dir = "data/courses"
        os.makedirs(self.output_dir, exist_ok=True)
        
    def get_driver(self):
        """Initialise et retourne un driver Selenium"""
        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-gpu")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        # Ajout d'un User-Agent plus réaliste
        options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36")
        return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    
    def wait_and_get_html(self, driver, by, value, timeout=15):
        """Attend l'apparition d'un élément et retourne le HTML"""
        try:
            WebDriverWait(driver, timeout).until(EC.presence_of_element_located((by, value)))
            return driver.page_source
        except Exception as e:
            print(f"⚠️ Timeout en attendant l'élément {by}={value}: {str(e)}")
            return driver.page_source
    
    def get_course_links(self, driver, filtre_type="Plat", jours=1):
        """Récupère les liens des courses selon le filtre et la période"""
        print(f"🔍 Recherche des courses de {filtre_type} pour les {jours} prochains jours...")
        
        driver.get(self.courses_url)
        time.sleep(5)  # Augmentation du délai pour s'assurer que la page est chargée
        
        # Liste pour stocker les liens des courses
        links_courses = []
        
        # Date d'aujourd'hui et période
        today = datetime.now()
        
        try:
            # Vérifions d'abord si la page a bien chargé
            print(f"🌐 URL actuelle: {driver.current_url}")
            
            # Prenons une capture d'écran pour le débogage
            screenshot_dir = os.path.join(self.output_dir, "debug")
            os.makedirs(screenshot_dir, exist_ok=True)
            screenshot_path = os.path.join(screenshot_dir, "courses_list.png")
            driver.save_screenshot(screenshot_path)
            print(f"📸 Capture d'écran sauvegardée: {screenshot_path}")
            
            html = driver.page_source
            
            # Sauvegardons le HTML pour le débogage
            with open(os.path.join(screenshot_dir, "courses_list.html"), "w", encoding="utf-8") as f:
                f.write(html)
            
            soup = BeautifulSoup(html, "html.parser")
            
            # Nouveau code pour extraire les cartes des hippodromes
            cards = soup.select(".card-panel, [class*='card']")  # Sélecteur CSS plus inclusif
            print(f"🎴 Trouvé {len(cards)} cartes d'hippodromes sur la page")
            
            for card in cards:
                # Chercher si cette carte contient une indication "Plat : X"
                card_text = card.get_text().strip()
                
                # Vérifier si c'est une course de plat (la mention "Plat : X" doit apparaître)
                plat_indicator = False
                if "Plat :" in card_text or "Plat:" in card_text:
                    plat_indicator = True
                    print(f"✅ Trouvé une carte pour courses de Plat: {card_text[:50]}...")
                else:
                    print(f"❌ Ignoré une carte non-Plat: {card_text[:50]}...")
                    continue  # Passer à la carte suivante si ce n'est pas une course de plat
                
                # Extraire le nom de l'hippodrome
                hippodrome_element = card.select_one("h3, h2, [class*='title'], strong, b")
                hippodrome = hippodrome_element.text.strip() if hippodrome_element else "Hippodrome inconnu"
                
                # Extraire l'URL
                link = card.select_one("a[href*='courses']")
                if link and link.get("href"):
                    href = link.get("href")
                    full_url = f"{self.base_url}{href}" if href.startswith('/') else href
                    print(f"🏁 Trouvé course de Plat: {hippodrome} - {full_url}")
                    links_courses.append({"url": full_url, "hippodrome": hippodrome})
            
            # Si on ne trouve rien avec la nouvelle méthode, essayer l'ancienne approche
            if not links_courses:
                print("⚠️ Aucune course trouvée avec la méthode principale, essai de la méthode alternative...")
                
                # Méthode alternative pour le cas où la structure de la page serait différente
                rows = soup.select("table tbody tr")
                print(f"📋 Trouvé {len(rows)} lignes dans le tableau (méthode alternative)")
                
                for row in rows:
                    # Chercher un indicateur de type de course (Plat vs Obstacle)
                    row_text = row.get_text().strip()
                    if "Plat" in row_text and "Obstacle" not in row_text:
                        # Extraire le lien de la course
                        link_tag = row.select_one("td a")
                        if link_tag and link_tag.get("href"):
                            full_url = f"{self.base_url}{link_tag['href']}" if link_tag['href'].startswith('/') else link_tag['href']
                            hippodrome = link_tag.text.strip()
                            print(f"🏁 Trouvé course (alt): {hippodrome} - {full_url}")
                            links_courses.append({"url": full_url, "hippodrome": hippodrome})
            
            print(f"✅ Trouvé {len(links_courses)} courses de {filtre_type}")
            return links_courses
            
        except Exception as e:
            print(f"❌ Erreur lors de la recherche des courses: {str(e)}")
            traceback.print_exc()
            return []
    
    def extract_course_details(self, driver, course_url, hippodrome):
        """Extrait les détails de toutes les courses d'un hippodrome"""
        print(f"📍 Scraping des courses à {hippodrome}...")
        
        driver.get(course_url)
        time.sleep(5)  # Augmentation du délai
        
        courses_data = {
            "hippodrome": hippodrome,
            "date_extraction": datetime.now().isoformat(),
            "url_source": course_url,
            "courses": []
        }
        
        try:
            # Prenons une capture d'écran pour le débogage
            screenshot_dir = os.path.join(self.output_dir, "debug")
            os.makedirs(screenshot_dir, exist_ok=True)
            screenshot_path = os.path.join(screenshot_dir, f"{hippodrome.lower().replace(' ', '_')}_reunion.png")
            driver.save_screenshot(screenshot_path)
            print(f"📸 Capture d'écran sauvegardée: {screenshot_path}")
            
            html = driver.page_source
            
            # Sauvegardons le HTML pour le débogage
            with open(os.path.join(screenshot_dir, f"{hippodrome.lower().replace(' ', '_')}_reunion.html"), "w", encoding="utf-8") as f:
                f.write(html)
            
            soup = BeautifulSoup(html, "html.parser")
            
            # Récupérer la date de la réunion
            date_element = soup.select_one(".event-date, .date, [class*='date']")
            if date_element:
                courses_data["date_reunion"] = date_element.text.strip()
                print(f"📅 Date de réunion: {courses_data['date_reunion']}")
            else:
                print("⚠️ Date de réunion non trouvée")
                # Essayons de récupérer la date d'aujourd'hui
                courses_data["date_reunion"] = datetime.now().strftime("%d/%m/%Y")
                print(f"📅 Date de réunion (par défaut): {courses_data['date_reunion']}")
            
            # Récupérer les informations de terrain
            terrain_element = soup.select_one(".field-terrain, .terrain, [class*='terrain']")
            if terrain_element:
                courses_data["terrain"] = terrain_element.text.strip()
                print(f"🌱 Terrain: {courses_data['terrain']}")
            
            # Récupérer les liens vers chaque course (essayer plusieurs sélecteurs)
            course_links = soup.select("a[href*='/courses/fiche-course'], a[href*='fiche-course'], table a")
            print(f"🔗 Trouvé {len(course_links)} liens de courses")
            
            for index, link in enumerate(course_links):
                # Vérifier si l'attribut href existe et s'il est valide
                href = link.get("href")
                if not href or href == "#" or not href.startswith(("/", "http")):
                    print(f"⚠️ Lien invalide trouvé: {repr(href)}, ignoré.")
                    continue
                
                course_name = link.text.strip()
                print(f"🔎 Nom de course: {repr(course_name)}")
                
                # Ignorer les liens avec des noms vides ou suspects
                if not course_name or course_name == "-":
                    print("⚠️ Nom de course vide ou invalide, ignoré.")
                    continue
                
                # S'assurer que c'est bien une course de plat
                parent_element = link.parent.parent if link.parent else None
                if parent_element:
                    parent_text = parent_element.get_text().strip()
                    # Si on trouve "Obstacle" dans le texte parent, c'est une course d'obstacles
                    if "Obstacle" in parent_text and "Plat" not in parent_text:
                        print(f"⚠️ Course d'obstacles détectée, ignorée: {course_name}")
                        continue
                
                # Construire l'URL complète
                course_url = f"{self.base_url}{href}" if href.startswith('/') else href
                
                print(f"  ⏳ Course {index+1}/{len(course_links)}: {course_name} - {course_url}")
                
                try:
                    # Aller sur la page de détail de la course
                    driver.get(course_url)
                    time.sleep(3)
                    
                    # Prenons une capture d'écran pour le débogage
                    screenshot_path = os.path.join(screenshot_dir, f"{hippodrome.lower().replace(' ', '_')}_course_{index+1}.png")
                    driver.save_screenshot(screenshot_path)
                    
                    course_html = driver.page_source
                    
                    # Sauvegardons le HTML pour le débogage
                    with open(os.path.join(screenshot_dir, f"{hippodrome.lower().replace(' ', '_')}_course_{index+1}.html"), "w", encoding="utf-8") as f:
                        f.write(course_html)
                    
                    course_soup = BeautifulSoup(course_html, "html.parser")
                    
                    # Vérifier une dernière fois si c'est une course de plat
                    page_text = course_soup.get_text().strip()
                    if "Obstacle" in page_text and "Plat" not in page_text:
                        print(f"⚠️ Page de course d'obstacles détectée, ignorée: {course_name}")
                        continue
                    
                    # Extraire les détails de la course
                    course_data = {
                        "nom": course_name,
                        "url": course_url,
                        "participants": []
                    }
                    
                    # Extraire les infos complémentaires
                    infos = course_soup.select(".infos-complementaires li, .infos li, [class*='infos'] li")
                    for info in infos:
                        key_element = info.select_one("span.label, .label, strong, b")
                        value_element = info.select_one("span.value, .value")
                        
                        if key_element and value_element:
                            key = key_element.text.strip().rstrip(':')
                            value = value_element.text.strip()
                            course_data[key.lower().replace(' ', '_')] = value
                        elif key_element:
                            # Si on a seulement la clé, essayer d'extraire la valeur du reste du texte
                            info_text = info.get_text().strip()
                            key = key_element.text.strip().rstrip(':')
                            value = info_text.replace(key, '').strip(' :')
                            if value:
                                course_data[key.lower().replace(' ', '_')] = value
                    
                    # Horaire de la course (généralement en haut de la page)
                    horaire_element = course_soup.select_one(".horaire, .time, .heure, [class*='horaire'], [class*='time']")
                    if horaire_element:
                        course_data["horaire"] = horaire_element.text.strip()
                    
                    # PDF Programme
                    pdf_link = course_soup.select_one("a[href*='.pdf']")
                    if pdf_link and pdf_link.get('href'):
                        pdf_href = pdf_link.get('href')
                        course_data["pdf_programme"] = f"{self.base_url}{pdf_href}" if pdf_href.startswith('/') else pdf_href
                    
                    # Vidéo replay
                    video_link = course_soup.select_one("a.video-link, a[href*='video'], [class*='video']")
                    if video_link and video_link.get('href'):
                        video_href = video_link.get('href')
                        course_data["video_replay"] = f"{self.base_url}{video_href}" if video_href.startswith('/') else video_href
                    
                    # Extraire les partants (participants)
                    table = course_soup.find("table", class_="tableaupartants") or course_soup.select_one("table")
                    
                    if table:
                        # Essayer de trouver les en-têtes dans le thead
                        thead = table.select_one("thead")
                        if thead:
                            headers = [th.text.strip() for th in thead.select("th")]
                        else:
                            # Sinon, utiliser la première ligne comme en-têtes
                            first_row = table.select_one("tr")
                            if first_row:
                                headers = [th.text.strip() for th in first_row.select("th")] or [td.text.strip() for td in first_row.select("td")]
                            else:
                                headers = []
                        
                        print(f"📊 En-têtes trouvés: {headers}")
                        
                        # Sélectionner les lignes du corps du tableau
                        body_rows = table.select("tbody tr") if table.select_one("tbody") else table.select("tr")[1:] if table.select("tr") else []
                        
                        print(f"📋 Trouvé {len(body_rows)} lignes de participants")
                        
                        for tr in body_rows:
                            cells = tr.find_all("td")
                            if len(cells) >= min(1, len(headers)):  # Au moins une cellule
                                participant = {}
                                
                                # Si nous avons des en-têtes, les utiliser pour nommer les colonnes
                                if headers:
                                    for i, header in enumerate(headers):
                                        if i < len(cells):  # Éviter l'index out of range
                                            key = header.lower().replace(' ', '_') if header else f"column_{i+1}"
                                            # Récupérer le texte et supprimer les espaces superflus
                                            value = cells[i].text.strip()
                                            participant[key] = value
                                            
                                            # Si c'est une cellule avec un lien (comme le nom du cheval)
                                            link = cells[i].find("a")
                                            if link and link.get("href"):
                                                url = f"{self.base_url}{link['href']}" if link['href'].startswith('/') else link['href']
                                                participant[f"{key}_url"] = url
                                else:
                                    # Sans en-têtes, utiliser des noms génériques
                                    for i, cell in enumerate(cells):
                                        key = f"column_{i+1}"
                                        value = cell.text.strip()
                                        participant[key] = value
                                        
                                        # Chercher les liens
                                        link = cell.find("a")
                                        if link and link.get("href"):
                                            url = f"{self.base_url}{link['href']}" if link['href'].startswith('/') else link['href']
                                            participant[f"{key}_url"] = url
                                
                                course_data["participants"].append(participant)
                    
                    # MODIFICATION: Ne garder que les courses avec des participants réels
                    if course_data.get("participants") and len(course_data["participants"]) >= 2 and \
                       any(p.get("cheval") or p.get("n") or p.get("n°") or p.get("jockey") or p.get("poids") for p in course_data["participants"]):
                        courses_data["courses"].append(course_data)
                        print(f"✅ Course ajoutée avec {len(course_data['participants'])} participants: {course_name}")
                    else:
                        print(f"⚠️ Course ignorée car trop peu de données: {course_name}")
                    
                except Exception as e:
                    print(f"❌ Erreur lors du traitement de la course {course_name}: {str(e)}")
                    traceback.print_exc()
                    # Continuer avec la course suivante malgré l'erreur
            
            # MODIFICATION: Marquer si le fichier est vide
            if not courses_data["courses"]:
                print(f"⚠️ Aucune course valide trouvée pour {hippodrome}, le fichier sera vide")
                courses_data["empty"] = True
                
            return courses_data
            
        except Exception as e:
            print(f"❌ Erreur lors de l'extraction des courses à {hippodrome}: {str(e)}")
            traceback.print_exc()
            courses_data["error"] = str(e)
            return courses_data
    
    def save_json(self, data, filename):
        """Sauvegarde les données au format JSON"""
        filepath = os.path.join(self.output_dir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"💾 Données sauvegardées dans {filepath}")
    
    def enrich_existing_json_files(self):
        """Parcourt tous les fichiers JSON de course existants pour les enrichir avec les détails"""
        files = [f for f in os.listdir(self.output_dir) if f.endswith(".json")]
        
        print(f"🔄 Enrichissement de {len(files)} fichiers JSON existants...")
        
        for filename in files:
            filepath = os.path.join(self.output_dir, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)

            url = data.get("url_source")
            hippodrome = data.get("hippodrome", filename.replace(".json", ""))
            
            if not url:
                print(f"⚠️ Pas d'URL source dans {filename}, fichier ignoré.")
                continue
            
            print(f"🔍 Re-scraping de {hippodrome} depuis {url}")
            driver = self.get_driver()
            try:
                enriched_data = self.extract_course_details(driver, url, hippodrome)
                self.save_json(enriched_data, filename)
            except Exception as e:
                print(f"❌ Erreur sur {filename}: {e}")
                traceback.print_exc()
            finally:
                driver.quit()
    
    def run(self, filtre_type="Plat", jours=1):
        """Exécute le scraper complet"""
        print(f"🏇 Début du scraping des courses de {filtre_type} pour les {jours} prochains jours")
        
        driver = self.get_driver()
        try:
            # Récupérer les liens des courses
            course_links = self.get_course_links(driver, filtre_type, jours)
            
            for i, course in enumerate(course_links):
                print(f"⏳ Traitement {i+1}/{len(course_links)}: {course['hippodrome']}")
                
                # Extraire les détails des courses
                course_data = self.extract_course_details(driver, course["url"], course["hippodrome"])
                
                # Générer un nom de fichier basé sur l'hippodrome et la date
                date_str = datetime.now().strftime("%Y-%m-%d")
                safe_name = course["hippodrome"].replace(" ", "_").replace("/", "-").lower()
                filename = f"{date_str}_{safe_name}.json"
                
                # Sauvegarder les données
                self.save_json(course_data, filename)
                
                # MODIFICATION: Supprimer les fichiers vides
                if not course_data.get("courses"):
                    filepath = os.path.join(self.output_dir, filename)
                    print(f"🗑️ Suppression du fichier JSON vide pour {course['hippodrome']}")
                    os.remove(filepath)
            
            print(f"🎉 Scraping terminé! {len(course_links)} hippodromes traités.")
            
        except Exception as e:
            print(f"❌ Erreur générale: {str(e)}")
            traceback.print_exc()
        finally:
            driver.quit()
    
    def direct_scrape_url(self, url, filename=None):
        """Scrape directement une URL spécifique de course"""
        print(f"🔍 Scraping direct de l'URL: {url}")
        
        driver = self.get_driver()
        try:
            # Déterminer le nom de l'hippodrome à partir de l'URL ou utiliser un générique
            hippodrome = "course_directe"
            
            # Extraire les détails des courses
            course_data = self.extract_course_details(driver, url, hippodrome)
            
            # Si un nom de fichier n'est pas fourni, en générer un
            if not filename:
                date_str = datetime.now().strftime("%Y-%m-%d")
                filename = f"{date_str}_direct_scrape.json"
            
            # Sauvegarder les données
            self.save_json(course_data, filename)
            
            # MODIFICATION: Supprimer si vide
            if not course_data.get("courses"):
                filepath = os.path.join(self.output_dir, filename)
                print(f"🗑️ Suppression du fichier JSON vide pour le scraping direct")
                os.remove(filepath)
            
            print(f"✅ Scraping direct terminé pour {url}")
            
        except Exception as e:
            print(f"❌ Erreur lors du scraping direct: {str(e)}")
            traceback.print_exc()
        finally:
            driver.quit()

if __name__ == "__main__":
    import os
    import sys
    
    # Obtenir les variables d'environnement (utile pour GitHub Actions)
    type_course = os.environ.get("TYPE_COURSE", "Plat")
    jours = int(os.environ.get("JOURS", "3"))
    mode = os.environ.get("MODE", "all")  # "all", "new", "enrich", "direct"
    direct_url = os.environ.get("URL", "")
    
    scraper = ScraperCoursesFG()
    
    # Vérifier si on a des arguments en ligne de commande
    if len(sys.argv) > 1:
        # Si premier argument est une URL, faire un scraping direct
        if sys.argv[1].startswith("http"):
            direct_url = sys.argv[1]
            mode = "direct"
        # Sinon considérer que c'est le mode
        else:
            mode = sys.argv[1]
    
    # Mode selon l'environnement ou valeur par défaut
    if mode == "direct" and direct_url:
        # Scraping direct d'une URL
        scraper.direct_scrape_url(direct_url)
    elif mode == "all" or mode == "new":
        # Étape 1 : Scraper les nouvelles courses
        scraper.run(filtre_type=type_course, jours=jours)
    
    if mode == "all" or mode == "enrich":
        # Étape 2 : Enrichir les JSON avec les détails internes
        scraper.enrich_existing_json_files()
