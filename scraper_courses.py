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
        self.courses_aujourdhui_url = f"{self.base_url}/fr/courses/aujourdhui"
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
    
    def extract_participants_table(self, course_soup):
        """Extrait les participants depuis le tableau de partants de la page de course"""
        table = course_soup.find("table")
        if not table:
            return []

        headers = []
        thead = table.find("thead")
        if thead:
            headers = [th.get_text(strip=True) for th in thead.find_all("th")]
        else:
            # Si pas de thead, prendre la première ligne comme en-têtes
            first_row = table.find("tr")
            if first_row:
                headers = [th.get_text(strip=True) for th in first_row.find_all("th") or first_row.find_all("td")]
        
        if not headers:
            print("⚠️ Aucun en-tête trouvé dans le tableau des partants")
            return []
            
        print(f"📊 En-têtes trouvés: {headers}")

        body_rows = table.find("tbody").find_all("tr") if table.find("tbody") else table.find_all("tr")[1:] if len(table.find_all("tr")) > 1 else []
        participants = []
        
        print(f"📋 Trouvé {len(body_rows)} lignes de participants")

        for row in body_rows:
            cells = row.find_all("td")
            if len(cells) < 3:  # Un participant valide doit avoir au moins quelques cellules
                continue

            participant = {}
            for i, cell in enumerate(cells):
                if i >= len(headers):
                    key = f"column_{i+1}"
                else:
                    key = headers[i].lower().replace(" ", "_").replace(".", "").replace("/", "_")
                
                value = cell.get_text(strip=True)
                participant[key] = value

                # Cherche lien
                link = cell.find("a")
                if link and link.get("href"):
                    href = link["href"]
                    if not href.startswith("http"):
                        if not href.startswith("/"):
                            href = "/" + href
                        href = self.base_url + href
                    participant[f"{key}_url"] = href

            # Ne conserver que les participants avec des données significatives
            if participant:
                participants.append(participant)

        return participants
    
    def get_links_from_aujourdhui_page(self, driver):
        """Récupère les liens des réunions pour aujourd'hui, toutes disciplines confondues"""
        print(f"📅 Accès à la page des courses du jour: {self.courses_aujourdhui_url}")
        driver.get(self.courses_aujourdhui_url)
        time.sleep(5)  # Attendre que la page se charge

        print("🔍 Scraping des courses du jour (page 'aujourdhui')...")
        links = []

        # Prenons une capture d'écran pour le débogage
        screenshot_dir = os.path.join(self.output_dir, "debug")
        os.makedirs(screenshot_dir, exist_ok=True)
        screenshot_path = os.path.join(screenshot_dir, "aujourdhui_page.png")
        driver.save_screenshot(screenshot_path)
        print(f"📸 Capture d'écran sauvegardée: {screenshot_path}")
        
        # Sauvegardons le HTML pour le débogage
        html = driver.page_source
        with open(os.path.join(screenshot_dir, "aujourdhui_page.html"), "w", encoding="utf-8") as f:
            f.write(html)

        soup = BeautifulSoup(html, "html.parser")
        
        # Méthode 1: Cartes de réunion standard
        cards = soup.select("a.reunion-card")
        print(f"📊 Méthode 1: Trouvé {len(cards)} cartes de réunion")
        
        # Méthode 2: Approche plus générale - liens de réunion
        if not cards:
            cards = soup.select("a[href*='fiche-reunion']")
            print(f"📊 Méthode 2: Trouvé {len(cards)} liens de réunion")
        
        # Méthode 3: Chercher tous les liens qui pourraient être des réunions
        if not cards:
            cards = soup.select("a[href*='reunion']")
            print(f"📊 Méthode 3: Trouvé {len(cards)} liens contenant 'reunion'")
        
        # Méthode 4: Chercher dans les tableaux
        if not cards:
            tables = soup.select("table")
            for table in tables:
                links_in_table = table.select("a")
                if links_in_table:
                    print(f"📊 Méthode 4: Trouvé {len(links_in_table)} liens dans un tableau")
                    cards.extend(links_in_table)
        
        # Méthode 5: Dernier recours - tous les liens
        if not cards:
            # Analyse de la structure de la page pour comprendre
            sections = soup.select("section, div.main-content, div.content")
            if sections:
                print(f"🔍 Structure de la page: trouvé {len(sections)} sections principales")
                for section in sections:
                    links_in_section = section.select("a")
                    if links_in_section:
                        likely_reunion_links = [a for a in links_in_section if "reunion" in a.get("href", "").lower()]
                        if likely_reunion_links:
                            print(f"🔍 Trouvé {len(likely_reunion_links)} liens probables de réunion dans une section")
                            cards.extend(likely_reunion_links)
        
        # IMPORTANTE MODIFICATION: Si après toutes ces méthodes nous n'avons trouvé aucune réunion,
        # nous considérons toutes les réunions comme incluant du "Plat" pour éviter de manquer des données
        if not cards:
            print("⚠️ Aucune réunion trouvée avec les méthodes de détection standard.")
            print("ℹ️ Nous allons utiliser une stratégie de récupération avec les liens directs de courses")
            
            # Chercher tous les liens qui pourraient mener à des fiches de courses
            course_links = soup.select("a[href*='fiche-course']")
            if course_links:
                print(f"🔄 Stratégie de récupération: trouvé {len(course_links)} liens directs vers des courses")
                # Nous allons extraire les hippodromes directement des noms de courses
                for link in course_links:
                    # Essayer d'extraire l'hippodrome du texte du lien ou d'un parent proche
                    course_name = link.get_text(strip=True)
                    hippodrome_text = None
                    
                    # Remonter dans l'arbre DOM pour trouver un élément avec le nom de l'hippodrome
                    parent = link.parent
                    for _ in range(3):  # Remonter jusqu'à 3 niveaux
                        if parent:
                            headers = parent.select("h1, h2, h3, h4, .title, .hippodrome")
                            if headers:
                                hippodrome_text = headers[0].get_text(strip=True)
                                break
                            parent = parent.parent
                    
                    # Si on n'a pas trouvé d'hippodrome, utiliser un nom générique
                    if not hippodrome_text:
                        hippodrome_text = "Hippodrome inconnu"
                    
                    href = link.get("href")
                    if href:
                        full_url = self.base_url + href if href.startswith("/") else href
                        print(f"✅ Course directe trouvée : {course_name} à {hippodrome_text} - {full_url}")
                        
                        # Extraire l'URL de la réunion à partir de l'URL de la course
                        # Exemple: /fr/courses/fiche-course/2025/04/16/reunion1 -> /fr/courses/reunion/2025/04/16/reunion1
                        reunion_url = None
                        if "fiche-course" in href:
                            parts = href.split("/")
                            if len(parts) >= 6:  # Assez de parties pour reconstituer
                                reunion_parts = []
                                for part in parts:
                                    reunion_parts.append(part)
                                    if "reunion" in part.lower():
                                        break
                                if reunion_parts:
                                    reunion_url = "/".join(reunion_parts)
                                    reunion_url = reunion_url.replace("fiche-course", "reunion")
                                    reunion_url = self.base_url + reunion_url if reunion_url.startswith("/") else reunion_url
                                    
                        if reunion_url:
                            links.append({"hippodrome": hippodrome_text, "url": reunion_url})
                        else:
                            # Dernier recours: utiliser directement la page de la course
                            links.append({"hippodrome": hippodrome_text, "url": full_url, "is_course": True})
                
                # Déduplicaton des liens
                unique_links = []
                urls_seen = set()
                for link in links:
                    if link["url"] not in urls_seen:
                        urls_seen.add(link["url"])
                        unique_links.append(link)
                
                links = unique_links
                return links  # Retourner les liens directs
        
        # Traitement standard des cartes de réunion trouvées
        for card in cards:
            href = card.get("href")
            if not href or href == "#":
                continue
                
            # Trouver le nom de l'hippodrome
            lieu = card.select_one("h2, .title, .hippodrome, .reunion-title")
            if not lieu:
                # Si pas de titre standard, utiliser le texte du lien lui-même
                lieu_text = card.get_text(strip=True)
                if lieu_text:
                    lieu = type('obj', (object,), {'text': lieu_text})
            
            # Vérifier si c'est une course de Plat
            type_course_element = card.select_one(".discipline, [class*='discipline'], .type-course, [class*='type']")
            type_course = type_course_element.text.strip().lower() if type_course_element else card.text.lower()
            
            # Si aucune information sur le type n'est trouvée, on considère toutes les réunions
            is_plat = True if not type_course_element else "plat" in type_course
            
            if lieu:
                url_reunion = self.base_url + href if href.startswith("/") else href
                hippodrome = lieu.text.strip()
                if is_plat:
                    print(f"✅ Réunion plat trouvée : {hippodrome} - {url_reunion}")
                    links.append({"hippodrome": hippodrome, "url": url_reunion})
                else:
                    print(f"⏭️ Réunion ignorée (non-plat): {hippodrome} - {type_course}")
            elif href:
                # Si on n'a pas pu déterminer le lieu mais qu'on a un lien, l'utiliser quand même
                url_reunion = self.base_url + href if href.startswith("/") else href
                hippodrome = "Hippodrome non identifié"
                print(f"⚠️ Réunion sans nom trouvée - {url_reunion}")
                links.append({"hippodrome": hippodrome, "url": url_reunion})

        # Si aucune réunion n'est trouvée, considérer toutes les réunions (même les non-Plat)
        if not links:
            print("⚠️ Aucune réunion de type Plat trouvée. Inclusion de toutes les réunions...")
            for card in cards:
                href = card.get("href")
                if not href or href == "#":
                    continue
                    
                lieu = card.select_one("h2, .title, .hippodrome, .reunion-title")
                hippodrome = lieu.text.strip() if lieu else "Hippodrome inconnu"
                url_reunion = self.base_url + href if href.startswith("/") else href
                print(f"🔄 Inclusion réunion alternative : {hippodrome} - {url_reunion}")
                links.append({"hippodrome": hippodrome, "url": url_reunion})

        print(f"🏁 Total: {len(links)} réunions trouvées aujourd'hui")
        return links
    
    def extract_course_details(self, driver, course_url, hippodrome, is_course=False):
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
            
            # NOUVELLE APPROCHE: Trouver le tableau des courses sur la page de réunion
            course_table = soup.select_one("table")
            if not course_table:
                print("⚠️ Aucun tableau de courses trouvé sur la page de réunion")
                
                # Si pas de tableau, essayer de trouver des liens directs vers les courses
                course_links = soup.select("a[href*='fiche-course']")
                if course_links:
                    print(f"🔄 Alternative: trouvé {len(course_links)} liens directs vers des courses")
                    
                    for index, link in enumerate(course_links):
                        course_name = link.get_text(strip=True)
                        href = link.get("href")
                        course_url = self.base_url + href if href.startswith("/") else href
                        
                        print(f"🔍 Course {index+1}/{len(course_links)}: {course_name}")
                        
                        try:
                            driver.get(course_url)
                            time.sleep(3)
                            
                            course_html = driver.page_source
                            course_soup = BeautifulSoup(course_html, "html.parser")
                            
                            # Extraire les détails de la course
                            horaire = ""
                            horaire_element = course_soup.select_one(".horaire, .time, [class*='horaire']")
                            if horaire_element:
                                horaire = horaire_element.get_text(strip=True)
                            
                            numero = f"{index+1}"
                            numero_element = course_soup.select_one(".numero, .course-number, [class*='numero']")
                            if numero_element:
                                numero = numero_element.get_text(strip=True)
                            
                            course_data = {
                                "nom": course_name,
                                "horaire": horaire,
                                "numero": numero,
                                "url": course_url,
                                "participants": []
                            }
                            
                            # Extraire les participants
                            participants = self.extract_participants_table(course_soup)
                            if participants:
                                course_data["participants"] = participants
                                print(f"✅ Extrait {len(participants)} participants pour {course_name}")
                                courses_data["courses"].append(course_data)
                                print(f"✅ Course ajoutée: {course_name}")
                            else:
                                print(f"⚠️ Aucun participant trouvé pour {course_name}")
                        
                        except Exception as e:
                            print(f"❌ Erreur lors du traitement de la course {course_name}: {str(e)}")
                            traceback.print_exc()
                    
                    return courses_data
                    
                return courses_data
                
            # Extraire les lignes du tableau (chaque ligne = une course)
            course_rows = course_table.select("tbody tr")
            if not course_rows:
                course_rows = course_table.select("tr")[1:] if len(course_table.select("tr")) > 1 else []
                
            print(f"🔎 Trouvé {len(course_rows)} courses dans la réunion")
            
            # Parcourir chaque ligne (course) dans le tableau
            for index, row in enumerate(course_rows):
                # Extraire les informations basiques de la course depuis le tableau
                cells = row.select("td")
                if len(cells) < 2:  # Vérifier si la ligne a suffisamment de cellules
                    continue
                    
                # Extraire l'horaire (première cellule généralement)
                horaire = cells[0].get_text(strip=True)
                
                # Extraire le numéro/ordre de la course
                numero = cells[1].get_text(strip=True) if len(cells) > 1 else ""
                
                # Extraire le nom de la course - chercher un lien dans une des cellules
                course_name = ""
                course_link = None
                
                for cell in cells:
                    link = cell.select_one("a")
                    if link:
                        course_name = link.get_text(strip=True)
                        href = link.get("href")
                        if href:
                            course_link = self.base_url + href if href.startswith("/") else href
                        break
                
                # Si on n'a pas trouvé de lien, prendre le texte de la 3ème cellule comme nom
                if not course_name and len(cells) > 2:
                    course_name = cells[2].get_text(strip=True)
                    
                # Si toujours pas de nom, générer un nom générique
                if not course_name:
                    course_name = f"Course {index+1}"
                
                print(f"✅ Course identifiée: {horaire} - {numero} - {course_name}")
                
                # Créer l'objet de données de base pour cette course
                course_data = {
                    "nom": course_name,
                    "horaire": horaire,
                    "numero": numero,
                    "url": course_link,
                    "participants": []
                }
                
                # Si nous avons un lien vers la page détaillée et que nous voulons les participants
                if course_link:
                    print(f"  ⏳ Navigation vers la page de détails: {course_link}")
                    
                    try:
                        # Ouvrir la page de la course pour extraire les participants
                        driver.get(course_link)
                        time.sleep(3)
                        
                        # Capture d'écran pour débogage
                        course_screenshot_path = os.path.join(screenshot_dir, f"{hippodrome.lower().replace(' ', '_')}_course_{index+1}.png")
                        driver.save_screenshot(course_screenshot_path)
                        
                        course_html = driver.page_source
                        course_soup = BeautifulSoup(course_html, "html.parser")
                        
                        # Extraire le tableau des participants
                        participants = self.extract_participants_table(course_soup)
                        
                        if participants:
                            course_data["participants"] = participants
                            print(f"  ✅ Extrait {len(participants)} participants pour {course_name}")
                            # Ajouter cette course uniquement si elle a des participants
                            courses_data["courses"].append(course_data)
                        else:
                            print(f"  ⚠️ Aucun participant trouvé pour {course_name}")
                            
                        # Revenir à la page de réunion pour continuer
                        driver.back()
                        time.sleep(2)
                    
                    except Exception as e:
                        print(f"❌ Erreur lors de l'accès aux détails de {course_name}: {str(e)}")
                        # Essayer de revenir à la page de réunion même en cas d'erreur
                        try:
                            driver.get(course_url)
                            time.sleep(2)
                        except:
                            pass
                
            # Si pas de courses détectées par le tableau, essayer une autre approche
            if not courses_data["courses"]:
                print("⚠️ Aucune course détectée via le tableau, tentative d'approche alternative")
                
                # Approche alternative: chercher des cartes ou éléments contenant des infos de course
                course_elements = soup.select(".course-card, .race-card, [class*='course'], [class*='race']")
                if course_elements:
                    print(f"🔄 Alternative: trouvé {len(course_elements)} éléments de course")
                    
                    for index, elem in enumerate(course_elements):
                        # Extraire les infos disponibles
                        horaire = ""
                        horaire_elem = elem.select_one(".horaire, .time, [class*='time'], [class*='horaire']")
                        if horaire_elem:
                            horaire = horaire_elem.get_text(strip=True)
                            
                        course_name = f"Course {index+1}"
                        name_elem = elem.select_one("h2, h3, .title, [class*='title']")
                        if name_elem:
                            course_name = name_elem.get_text(strip=True)
                            
                        # Chercher un lien
                        course_link = None
                        link = elem.select_one("a")
                        if link and link.get("href"):
                            href = link.get("href")
                            course_link = self.base_url + href if href.startswith("/") else href
                            
                        course_data = {
                            "nom": course_name,
                            "horaire": horaire,
                            "numero": str(index+1),
                            "url": course_link,
                            "participants": []
                        }
                        
                        # Si on a un lien, visiter la page détaillée
                        if course_link:
                            try:
                                driver.get(course_link)
                                time.sleep(3)
                                
                                course_html = driver.page_source
                                course_soup = BeautifulSoup(course_html, "html.parser")
                                
                                participants = self.extract_participants_table(course_soup)
                                if participants:
                                    course_data["participants"] = participants
                                    print(f"✅ Alternative: Extrait {len(participants)} participants pour {course_name}")
                                    # Ajouter cette course uniquement si elle a des participants
                                    courses_data["courses"].append(course_data)
                                else:
                                    print(f"⚠️ Aucun participant trouvé pour {course_name}")
                                
                                driver.back()
                                time.sleep(2)
                                
                            except Exception as e:
                                print(f"❌ Erreur lors de l'accès à la course alternative {course_name}: {str(e)}")
                                try:
                                    driver.get(course_url)
                                    time.sleep(2)
                                except:
                                    pass
            
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
    
    def run_today_only(self):
        """Exécute le scraper uniquement pour les courses du jour"""
        print("📆 Scraping uniquement des réunions d'aujourd'hui")
        driver = self.get_driver()

        try:
            courses_today = self.get_links_from_aujourdhui_page(driver)
            
            if not courses_today:
                print("⚠️ Aucune réunion trouvée pour aujourd'hui")
                return

            # Dictionnaire pour stocker les réunions par nom d'hippodrome
            hippodromes_processed = {}

            for i, course in enumerate(courses_today):
                hippodrome_name = course["hippodrome"]
                
                # Si l'hippodrome est "Plus", lui attribuer un identifiant unique
                if hippodrome_name == "Plus":
                    # Créer un nom unique en fonction de l'URL
                    unique_id = str(i+1)
                    url_parts = course["url"].split("/")
                    if len(url_parts) > 5:  # S'assurer qu'il y a assez de parties
                        # Utiliser la dernière partie de l'URL comme identifiant unique
                        unique_id = url_parts[-1][:8]  # Prendre les 8 premiers caractères
                    
                    # S'assurer que l'identifiant est sûr pour un nom de fichier
                    unique_id = "".join(c for c in unique_id if c.isalnum())
                    
                    # Créer un nom d'hippodrome unique
                    hippodrome_name = f"Reunion_{unique_id}"
                
                print(f"⏳ Traitement {i+1}/{len(courses_today)}: {hippodrome_name}")
                
                # Extraire les détails des courses
                is_course = course.get("is_course", False)
                course_data = self.extract_course_details(driver, course["url"], hippodrome_name, is_course)
                
                # Ne sauvegarder que s'il y a des courses avec des participants
                if course_data.get("courses"):
                    # Générer un nom de fichier basé sur l'hippodrome et la date
                    date_str = datetime.now().strftime("%Y-%m-%d")
                    safe_name = hippodrome_name.replace(" ", "_").replace("/", "-").lower()
                    
                    # S'assurer que le nom de fichier est unique si plusieurs réunions portent le même nom
                    count = hippodromes_processed.get(hippodrome_name, 0)
                    filename = f"{date_str}_{safe_name}.json" if count == 0 else f"{date_str}_{safe_name}_{count+1}.json"
                    hippodromes_processed[hippodrome_name] = count + 1
                    
                    # Sauvegarder les données
                    self.save_json(course_data, filename)
                    print(f"✅ Données sauvegardées pour {hippodrome_name} avec {len(course_data['courses'])} courses")
                else:
                    print(f"⚠️ Aucune course avec participants trouvée pour {hippodrome_name}, fichier non sauvegardé")
            
            print(f"🎉 Scraping terminé! {len(courses_today)} hippodromes traités.")
            
        except Exception as e:
            print(f"❌ Erreur lors du scraping des courses du jour: {str(e)}")
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
            
            # Sauvegarder les données seulement s'il y a des courses avec participants
            if course_data.get("courses"):
                self.save_json(course_data, filename)
                print(f"✅ Données sauvegardées pour le scraping direct avec {len(course_data['courses'])} courses")
            else:
                print(f"⚠️ Aucune course avec participants trouvée pour le scraping direct, fichier non sauvegardé")
            
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
    mode = os.environ.get("MODE", "today")  # "today", "enrich", "direct"
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
    
    # Afficher le mode d'exécution pour débogage
    print(f"🚀 Exécution du scraper en mode: {mode}")
    
    # Mode selon l'environnement ou valeur par défaut
    if mode == "direct" and direct_url:
        # Scraping direct d'une URL
        scraper.direct_scrape_url(direct_url)
    elif mode == "enrich":
        # Enrichir les JSON avec les détails internes
        scraper.enrich_existing_json_files()
    else:
        # Mode par défaut: scraper uniquement les courses du jour
        scraper.run_today_only()
