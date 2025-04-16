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
import re

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
                
            # Trouver le nom de l'hippodrome - Utiliser le sélecteur précis comme suggéré par l'expert
            lieu = card.select_one("div.card-content h2")
            if not lieu:
                # Si pas trouvé, utiliser des sélecteurs plus génériques
                lieu = card.select_one("h2, .title, .hippodrome, .reunion-title")
                
            if not lieu:
                # Si toujours pas trouvé, utiliser le texte du lien lui-même
                lieu_text = card.get_text(strip=True)
                if lieu_text:
                    # Éviter que le texte "Plus" soit pris comme nom d'hippodrome
                    if lieu_text == "Plus" or lieu_text.endswith("Plus"):
                        print("⚠️ Texte 'Plus' détecté, ignoré comme nom d'hippodrome")
                        continue
                    lieu = type('obj', (object,), {'text': lieu_text})
            
            # Vérifier si c'est une course de Plat
            type_course_element = card.select_one(".discipline, [class*='discipline'], .type-course, [class*='type']")
            type_course = type_course_element.text.strip().lower() if type_course_element else card.text.lower()
            
            # Si aucune information sur le type n'est trouvée, on considère toutes les réunions
            is_plat = True if not type_course_element else "plat" in type_course
            
            if lieu:
                url_reunion = self.base_url + href if href.startswith("/") else href
                hippodrome = lieu.text.strip()
                
                # Nettoyage supplémentaire pour éviter le texte "Plus" à la fin
                if hippodrome.endswith("Plus"):
                    hippodrome = hippodrome[:-4].strip()
                    
                print(f"✅ Réunion trouvée : {hippodrome} - {url_reunion}")
                links.append({"hippodrome": hippodrome, "url": url_reunion})
            elif href:
                # Si on n'a pas pu déterminer le lieu mais qu'on a un lien, l'utiliser quand même
                url_reunion = self.base_url + href if href.startswith("/") else href
                hippodrome = "Hippodrome non identifié"
                print(f"⚠️ Réunion sans nom trouvée - {url_reunion}")
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
            
            # Récupérer la date de la réunion
            date_element = soup.select_one(".event-date")
            if date_element:
                courses_data["date_reunion"] = date_element.text.strip()
                print(f"📅 Date de réunion: {courses_data['date_reunion']}")
            else:
                print("⚠️ Date de réunion non trouvée")
                # Essayons un autre sélecteur
                date_elements = soup.select(".date, time, [class*='date']")
                if date_elements:
                    courses_data["date_reunion"] = date_elements[0].text.strip()
                    print(f"📅 Date de réunion (alt): {courses_data['date_reunion']}")
                else:
                    # Utiliser la date du jour si on ne trouve pas de date
                    courses_data["date_reunion"] = datetime.now().strftime("%d/%m/%Y")
                    print(f"📅 Date de réunion (par défaut): {courses_data['date_reunion']}")
            
            # Récupérer les informations de terrain
            terrain_element = soup.select_one(".field-terrain")
            if terrain_element:
                courses_data["terrain"] = terrain_element.text.strip()
                print(f"🌱 Terrain: {courses_data['terrain']}")
            else:
                print("⚠️ Information de terrain non trouvée")
                # Essayons d'autres sélecteurs
                terrain_elements = soup.select(".terrain, [class*='terrain'], .field-state, .state, .piste")
                if terrain_elements:
                    courses_data["terrain"] = terrain_elements[0].text.strip()
                    print(f"🌱 Terrain (alt): {courses_data['terrain']}")
                else:
                    courses_data["terrain"] = "Information non disponible"
            
            # Si l'URL fournie est déjà une page de course, directement l'analyser
            if is_course:
                print("ℹ️ URL directe d'une course détectée, analyse directe...")
                course_name = soup.select_one("h1, .course-title, .event-title, .title")
                course_name = course_name.text.strip() if course_name else "Course sans nom"
                
                course_data = {
                    "nom": course_name,
                    "url": course_url,
                    "participants": []
                }
                
                # Extraire les infos complémentaires
                infos = soup.select(".infos-complementaires li, .course-info li, .details li")
                for info in infos:
                    key_element = info.select_one("span.label, .key, .info-label")
                    value_element = info.select_one("span.value, .value, .info-value")
                    if key_element and value_element:
                        key = key_element.text.strip().rstrip(':')
                        value = value_element.text.strip()
                        course_data[key.lower().replace(' ', '_')] = value
                
                # Extraire les partants avec la fonction dédiée
                participants = self.extract_participants_table(soup)
                
                if participants:
                    course_data["participants"] = participants
                    print(f"✅ Extrait {len(participants)} participants pour {course_name}")
                    courses_data["courses"].append(course_data)
                    print(f"✅ Course ajoutée avec {len(course_data['participants'])} participants: {course_name}")
                else:
                    print(f"⚠️ Aucun participant extrait pour {course_name}")
                
                return courses_data
            
            # Récupérer les liens vers chaque course
            course_links = soup.select("table a[href*='/courses/fiche-course']")
            print(f"🔗 Trouvé {len(course_links)} liens de courses")
            
            # Si nous n'avons pas trouvé de liens avec le sélecteur précis, essayons plus général
            if not course_links:
                print("⚠️ Aucun lien de course trouvé, essai de sélecteurs alternatifs")
                # Exclure les liens vers les pages de chevaux
                all_links = soup.select("a[href*='fiche-course']") 
                course_links = [link for link in all_links if "/cheval/" not in link.get("href", "")]
                
                if not course_links:
                    all_table_links = soup.select("table a")
                    course_links = [link for link in all_table_links if "/cheval/" not in link.get("href", "")]
                
                print(f"🔗 Trouvé {len(course_links)} liens de courses (alt)")
            
            # Dédupliquer les liens pour éviter les doublons
            unique_urls = set()
            filtered_links = []
            for link in course_links:
                href = link.get("href", "")
                # Exclure les liens vers les pages de chevaux
                if href and href not in unique_urls and "/cheval/" not in href:
                    unique_urls.add(href)
                    filtered_links.append(link)
            
            course_links = filtered_links
            print(f"🔗 Après déduplication: {len(course_links)} liens uniques")
            
            # Vérification de la première course pour savoir si on doit ignorer cette réunion
            if course_links:
                # Vérifions la première course pour décider si on traite toute la réunion
                first_link = course_links[0]
                href = first_link.get("href")
                if href and href != "#" and href.startswith(("/", "http")):
                    full_course_url = f"{self.base_url}{href}" if href.startswith('/') else href
                    print(f"🔍 Vérification de la première course: {full_course_url}")
                    
                    driver.get(full_course_url)
                    time.sleep(3)
                    html_first = driver.page_source
                    soup_first = BeautifulSoup(html_first, "html.parser")
                    
                    # Vérifier si c'est une course étrangère sans partants
                    no_participants_text = soup_first.find(string=lambda t: t and "partants et arrivées sont diffusés" in t.lower())
                    no_table = soup_first.find("table") is None
                    
                    if no_participants_text or no_table:
                        print(f"⛔ Première course sans partants ou course étrangère. On passe à une autre réunion.")
                        courses_data["note"] = "Réunion ignorée car étrangère ou sans partants"
                        return courses_data
            
            for index, link in enumerate(course_links):
                # Vérifier si l'attribut href existe et s'il est valide
                href = link.get("href")
                if not href or href == "#" or not href.startswith(("/", "http")):
                    print(f"⚠️ Lien invalide trouvé: {repr(href)}, ignoré.")
                    continue
                
                # Si le lien contient "/cheval/", l'ignorer
                if "/cheval/" in href:
                    print(f"⏭️ Lien ignoré car correspond à un cheval: {href}")
                    continue
                
                course_name = link.text.strip()
                print(f"🔎 Nom de course initial: {repr(course_name)}")
                
                # Ignorer les liens avec des noms vides ou suspects
                if not course_name or course_name == "-":
                    print("⚠️ Nom de course vide ou invalide, ignoré.")
                    continue
                
                # Ignorer les liens qui semblent être des résultats (ex: "6-7-1-3-9")
                if re.match(r'^[\d\-]+$', course_name):
                    print(f"⏭️ Lien ignoré car semble être un résultat: {course_name}")
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
                    
                    # Vérifier si c'est une course étrangère sans partants
                    no_partants_text = course_soup.find(string=lambda t: t and "partants et arrivées sont diffusés" in t.lower())
                    if no_partants_text:
                        print(f"⚠️ Course étrangère sans partants détectée, ignorée: {course_name}")
                        continue
                    
                    # Vérifier le type de course (spécialité)
                    specialite = course_soup.select_one(".specialite")
                    if specialite and "plat" not in specialite.text.lower():
                        print(f"⏭️ Course ignorée car non Plat: {course_name}")
                        continue
                    
                    # Extraire les détails de la course
                    course_data = {
                        "nom": course_name,  # Nom initial (sera remplacé si on trouve mieux)
                        "url": course_url,
                        "participants": []
                    }
                    
                    # Recherche du nom de la course (souvent dans un h1 ou élément avec une classe spécifique)
                    course_name_el = course_soup.select_one("h1, .course-title, .title")
                    if course_name_el:
                        course_data["nom"] = course_name_el.text.strip()
                        print(f"🏆 Nom de course amélioré: {course_data['nom']}")
                    
                    # Recherche du numéro de course et de l'horaire
                    # Pattern: "1ère(13)", "2ème(13)" suivi de l'horaire
                    numero_raw = course_soup.find(string=lambda t: t and (re.search(r'(\d+)[èe]re\s*\(', t) or re.search(r'(\d+)[èe]me\s*\(', t)))
                    if numero_raw:
                        # Extrait le numéro de course
                        match_numero = re.search(r'(\d+)[èe][mr]e\s*\(', numero_raw)
                        if match_numero:
                            numero = match_numero.group(1)
                            suffixe = "ère" if numero == "1" else "ème"
                            course_data["ordre"] = f"{numero}{suffixe}"
                            print(f"🔢 Ordre de course: {course_data['ordre']}")
                        
                        # Cherche l'horaire dans la même chaîne
                        match_horaire = re.search(r'—\s*(\d{1,2}[h:]\d{2})', numero_raw)
                        if match_horaire:
                            course_data["horaire"] = match_horaire.group(1)
                            print(f"⏰ Horaire: {course_data['horaire']}")
                    
                    # Si on n'a pas trouvé l'horaire, essayons d'autres sélecteurs
                    if "horaire" not in course_data:
                        horaire_element = course_soup.select_one(".horaire, .time, .heure")
                        if horaire_element:
                            horaire_text = horaire_element.text.strip()
                            match_heure = re.search(r'(\d{1,2}[h:]\d{2})', horaire_text)
                            if match_heure:
                                course_data["horaire"] = match_heure.group(1)
                                print(f"⏰ Horaire (alt): {course_data['horaire']}")
                    
                    # Extraire les infos complémentaires
                    infos = course_soup.select(".infos-complementaires li, .course-info li, .details li")
                    for info in infos:
                        key_element = info.select_one("span.label, .key, .info-label")
                        value_element = info.select_one("span.value, .value, .info-value")
                        if key_element and value_element:
                            key = key_element.text.strip().rstrip(':')
                            value = value_element.text.strip()
                            course_data[key.lower().replace(' ', '_')] = value
                    
                    # PDF Programme
                    pdf_link = course_soup.select_one("a[href*='.pdf']")
                    if pdf_link and pdf_link.get('href'):
                        pdf_href = pdf_link.get('href')
                        course_data["pdf_programme"] = f"{self.base_url}{pdf_href}" if pdf_href.startswith('/') else pdf_href
                    
                    # Vidéo replay
                    video_link = course_soup.select_one("a.video-link, a[href*='video'], .replay a")
                    if video_link and video_link.get('href'):
                        video_href = video_link.get('href')
                        course_data["video_replay"] = f"{self.base_url}{video_href}" if video_href.startswith('/') else video_href
                    
                    # Extraire les partants (participants)
                    participants = self.extract_participants_table(course_soup)
                    
                    if participants:
                        course_data["participants"] = participants
                        courses_data["courses"].append(course_data)
                        print(f"✅ Course ajoutée avec {len(participants)} participants: {course_data['nom']}")
                    else:
                        print(f"⚠️ Aucun participant extrait pour {course_data['nom']}")
                    
                except Exception as e:
                    print(f"❌ Erreur lors du traitement de la course {course_name}: {str(e)}")
                    traceback.print_exc()
                    # Continuer avec la course suivante malgré l'erreur
            
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

            for i, course in enumerate(courses_today):
                print(f"⏳ Traitement {i+1}/{len(courses_today)}: {course['hippodrome']}")
                
                # Extraire les détails des courses
                is_course = course.get("is_course", False)
                course_data = self.extract_course_details(driver, course["url"], course["hippodrome"], is_course)
                
                if not course_data.get("courses") and course_data.get("note"):
                    print(f"⚠️ Hippodrome ignoré: {course['hippodrome']} - {course_data.get('note')}")
                    continue
                
                # Générer un nom de fichier basé sur l'hippodrome et la date
                date_str = datetime.now().strftime("%Y-%m-%d")
                safe_name = course["hippodrome"].replace(" ", "_").replace("/", "-").lower()
                filename = f"{date_str}_{safe_name}.json"
                
                # Sauvegarder les données
                self.save_json(course_data, filename)
                
                if not course_data.get("courses"):
                    print(f"⚠️ Fichier JSON sans courses pour {course['hippodrome']} mais conservé pour analyse")
            
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
            
            # Sauvegarder les données
            self.save_json(course_data, filename)
            
            if not course_data.get("courses"):
                print(f"⚠️ Fichier JSON sans courses pour le scraping direct mais conservé pour analyse")
            
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