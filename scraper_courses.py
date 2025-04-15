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
        return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    
    def wait_and_get_html(self, driver, by, value, timeout=10):
        """Attend l'apparition d'un élément et retourne le HTML"""
        WebDriverWait(driver, timeout).until(EC.presence_of_element_located((by, value)))
        return driver.page_source
    
    def get_course_links(self, driver, filtre_type="Plat", jours=1):
        """Récupère les liens des courses selon le filtre et la période"""
        print(f"🔍 Recherche des courses de {filtre_type} pour les {jours} prochains jours...")
        
        driver.get(self.courses_url)
        time.sleep(3)
        
        # Liste pour stocker les liens des courses
        links_courses = []
        
        # Date d'aujourd'hui et période
        today = datetime.now()
        end_date = today + timedelta(days=jours)
        
        try:
            html = self.wait_and_get_html(driver, By.CSS_SELECTOR, "table")
            soup = BeautifulSoup(html, "html.parser")
            
            rows = soup.select("table tbody tr")
            
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
                    links_courses.append({"url": full_url, "hippodrome": hippodrome})
            
            print(f"✅ Trouvé {len(links_courses)} courses de {filtre_type}")
            return links_courses
            
        except Exception as e:
            print(f"❌ Erreur lors de la recherche des courses: {str(e)}")
            return []
    
    def extract_course_details(self, driver, course_url, hippodrome):
        """Extrait les détails de toutes les courses d'un hippodrome"""
        print(f"📍 Scraping des courses à {hippodrome}...")
        
        driver.get(course_url)
        time.sleep(3)
        
        courses_data = {
            "hippodrome": hippodrome,
            "date_extraction": datetime.now().isoformat(),
            "url_source": course_url,
            "courses": []
        }
        
        try:
            html = driver.page_source
            soup = BeautifulSoup(html, "html.parser")
            
            # Récupérer la date de la réunion
            date_element = soup.select_one(".event-date")
            if date_element:
                courses_data["date_reunion"] = date_element.text.strip()
            
            # Récupérer les informations de terrain
            terrain_element = soup.select_one(".field-terrain")
            if terrain_element:
                courses_data["terrain"] = terrain_element.text.strip()
            
            # Récupérer les liens vers chaque course
            course_links = soup.select("table a[href*='/courses/fiche-course']")
            
            for index, link in enumerate(course_links):
                course_name = link.text.strip()
                course_url = f"{self.base_url}{link['href']}"
                
                print(f"  ⏳ Course {index+1}/{len(course_links)}: {course_name}")
                
                # Aller sur la page de détail de la course
                driver.get(course_url)
                time.sleep(2)
                
                course_html = driver.page_source
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
                
                # PDF Programme
                pdf_link = course_soup.select_one("a[href*='.pdf']")
                if pdf_link:
                    course_data["pdf_programme"] = f"{self.base_url}{pdf_link['href']}"
                
                # Vidéo replay
                video_link = course_soup.select_one("a.video-link")
                if video_link:
                    course_data["video_replay"] = f"{self.base_url}{video_link['href']}"
                
                # Extraire les partants (participants)
                table = course_soup.find("table", class_="tableaupartants")
                if table:
                    headers = [th.text.strip() for th in table.select("thead th")]
                    
                    for tr in table.select("tbody tr"):
                        cells = tr.find_all("td")
                        if len(cells) >= len(headers):
                            participant = {}
                            
                            for i, header in enumerate(headers):
                                key = header.lower().replace(' ', '_')
                                # Récupérer le texte et supprimer les espaces superflus
                                value = cells[i].text.strip()
                                participant[key] = value
                                
                                # Si c'est une cellule avec un lien (comme le nom du cheval)
                                link = cells[i].find("a")
                                if link and link.get("href"):
                                    participant[f"{key}_url"] = f"{self.base_url}{link['href']}"
                            
                            course_data["participants"].append(participant)
                
                courses_data["courses"].append(course_data)
                
            return courses_data
            
        except Exception as e:
            print(f"❌ Erreur lors de l'extraction des courses à {hippodrome}: {str(e)}")
            courses_data["error"] = str(e)
            return courses_data
    
    def save_json(self, data, filename):
        """Sauvegarde les données au format JSON"""
        filepath = os.path.join(self.output_dir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"💾 Données sauvegardées dans {filepath}")
    
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
        finally:
            driver.quit()

if __name__ == "__main__":
    import os
    # Obtenir les variables d'environnement (utile pour GitHub Actions)
    type_course = os.environ.get("TYPE_COURSE", "Plat")
    jours = int(os.environ.get("JOURS", "3"))
    
    scraper = ScraperCoursesFG()
    scraper.run(filtre_type=type_course, jours=jours)
