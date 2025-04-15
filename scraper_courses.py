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
        self.courses_url = f"{self.base_url}/fr/courses/toutes-les-courses"
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
        end_date = today + timedelta(days=jours)
        
        try:
            # Vérifions d'abord si la page a bien chargé
            print(f"🌐 URL actuelle: {driver.current_url}")
            
            # Prenons une capture d'écran pour le débogage
            screenshot_dir = os.path.join(self.output_dir, "debug")
            os.makedirs(screenshot_dir, exist_ok=True)
            screenshot_path = os.path.join(screenshot_dir, "courses_list.png")
            driver.save_screenshot(screenshot_path)
            print(f"📸 Capture d'écran sauvegardée: {screenshot_path}")
            
            html = self.wait_and_get_html(driver, By.CSS_SELECTOR, "table")
            
            # Sauvegardons le HTML pour le débogage
            with open(os.path.join(screenshot_dir, "courses_list.html"), "w", encoding="utf-8") as f:
                f.write(html)
            
            soup = BeautifulSoup(html, "html.parser")
            
            # Vérifions si nous avons bien trouvé le tableau
            tables = soup.find_all("table")
            print(f"📊 Trouvé {len(tables)} tableaux sur la page")
            
            rows = soup.select("table tbody tr")
            print(f"📋 Trouvé {len(rows)} lignes dans le tableau")
            
            for row in rows:
                # Vérifier le type de course
                type_cell = row.select_one("td:nth-of-type(4)")
                if not type_cell or filtre_type not in type_cell.text:
                    continue
                
                # Vérifier la date
                date_cell = row.select_one("td:nth-of-type(1)")
                if date_cell:
                    try:
                        # Format de date attendu: "16/04/2025"
                        date_text = date_cell.text.strip()
                        date_parts = date_text.split('/')
                        if len(date_parts) == 3:
                            course_date = datetime(int(date_parts[2]), int(date_parts[1]), int(date_parts[0]))
                            if course_date < today or course_date > end_date:
                                continue
                    except (ValueError, IndexError):
                        # En cas d'erreur dans le parsing de date, on continue quand même
                        pass
                
                # Extraire le lien de la course
                link_tag = row.select_one("td a")
                if link_tag and link_tag.get("href"):
                    full_url = f"{self.base_url}{link_tag['href']}"
                    hippodrome = link_tag.text.strip()
                    print(f"🏁 Trouvé course: {hippodrome} - {full_url}")
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
            date_element = soup.select_one(".event-date")
            if date_element:
                courses_data["date_reunion"] = date_element.text.strip()
                print(f"📅 Date de réunion: {courses_data['date_reunion']}")
            else:
                print("⚠️ Date de réunion non trouvée")
                # Essayons un autre sélecteur
                date_elements = soup.select(".date")
                if date_elements:
                    courses_data["date_reunion"] = date_elements[0].text.strip()
                    print(f"📅 Date de réunion (alt): {courses_data['date_reunion']}")
            
            # Récupérer les informations de terrain
            terrain_element = soup.select_one(".field-terrain")
            if terrain_element:
                courses_data["terrain"] = terrain_element.text.strip()
                print(f"🌱 Terrain: {courses_data['terrain']}")
            else:
                print("⚠️ Information de terrain non trouvée")
                # Essayons d'autres sélecteurs
                terrain_elements = soup.select(".terrain") + soup.select("[class*='terrain']")
                if terrain_elements:
                    courses_data["terrain"] = terrain_elements[0].text.strip()
                    print(f"🌱 Terrain (alt): {courses_data['terrain']}")
            
            # Récupérer les liens vers chaque course
            course_links = soup.select("table a[href*='/courses/fiche-course']")
            print(f"🔗 Trouvé {len(course_links)} liens de courses")
            
            # Si nous n'avons pas trouvé de liens avec le sélecteur précis, essayons plus général
            if not course_links:
                print("⚠️ Aucun lien de course trouvé, essai de sélecteurs alternatifs")
                course_links = soup.select("a[href*='fiche-course']") or soup.select("table a")
                print(f"🔗 Trouvé {len(course_links)} liens de courses (alt)")
            
            for index, link in enumerate(course_links):
                course_name = link.text.strip()
                course_url = f"{self.base_url}{link['href']}" if link['href'].startswith('/') else link['href']
                
                print(f"  ⏳ Course {index+1}/{len(course_links)}: {course_name} - {course_url}")
                
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
                
                # Extraire les détails de la course
                course_data = {
                    "nom": course_name,
                    "url": course_url,
                    "participants": []
                }
                
                # Extraire les infos complémentaires
                infos = course_soup.select(".infos-complementaires li")
                for info in infos:
                    key_element = info.select_one("span.label")
                    value_element = info.select_one("span.value")
                    if key_element and value_element:
                        key = key_element.text.strip().rstrip(':')
                        value = value_element.text.strip()
                        course_data[key.lower().replace(' ', '_')] = value
                
                # Horaire de la course (généralement en haut de la page)
                horaire_element = course_soup.select_one(".horaire")
                if horaire_element:
                    course_data["horaire"] = horaire_element.text.strip()
                else:
                    # Essayons d'autres sélecteurs
                    horaire_elements = course_soup.select("[class*='horaire']") or course_soup.select(".time") or course_soup.select(".heure")
                    if horaire_elements:
                        course_data["horaire"] = horaire_elements[0].text.strip()
                
                # PDF Programme
                pdf_link = course_soup.select_one("a[href*='.pdf']")
                if pdf_link:
                    course_data["pdf_programme"] = f"{self.base_url}{pdf_link['href']}" if pdf_link['href'].startswith('/') else pdf_link['href']
                
                # Vidéo replay
                video_link = course_soup.select_one("a.video-link") or course_soup.select_one("a[href*='video']")
                if video_link:
                    course_data["video_replay"] = f"{self.base_url}{video_link['href']}" if video_link['href'].startswith('/') else video_link['href']
                
                # Extraire les partants (participants)
                table = course_soup.find("table", class_="tableaupartants")
                
                # Si nous ne trouvons pas la table avec la classe spécifique, essayons de trouver n'importe quelle table
                if not table:
                    print(f"⚠️ Table des partants non trouvée pour {course_name}, essai de sélecteurs alternatifs")
                    tables = course_soup.select("table")
                    if tables:
                        table = tables[0]  # Prendre la première table disponible
                
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
                
                courses_data["courses"].append(course_data)
                
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
