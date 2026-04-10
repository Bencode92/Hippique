// scrape-historical-results.js
// Scrape les résultats + cotes finales des courses passées via API PMU
// Ajoute arrivee + cote à chaque participant des fichiers existants
const fs = require('fs').promises;
const https = require('https');
const path = require('path');

const COURSES_DIR = './data/courses';
const BASE_URL = 'https://online.turfinfo.api.pmu.fr/rest/client/61';
const DELAY = 300; // ms entre requêtes

function apiGet(endpoint) {
  return new Promise((resolve) => {
    const url = `${BASE_URL}/${endpoint}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(d)); } catch (e) { resolve(null); }
        } else { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const days = parseInt(process.argv[2] || '30');
  console.log(`=== SCRAPE RÉSULTATS HISTORIQUES (${days} derniers jours) ===\n`);

  // Générer les dates
  const dates = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  let totalUpdated = 0, totalCourses = 0;

  for (const dateISO of dates) {
    const datePMU = dateISO.split('-').reverse().join('').replace(/^(\d{2})(\d{2})(\d{4})$/, '$1$2$3');
    // Format DDMMYYYY
    const [y, m, dd] = dateISO.split('-');
    const datePmuFormat = `${dd}${m}${y}`;

    // Vérifier si on a déjà les fichiers pour cette date
    const existingFiles = (await fs.readdir(COURSES_DIR).catch(() => []))
      .filter(f => f.startsWith(dateISO));

    if (!existingFiles.length) continue; // Pas de fichier pour cette date

    // Vérifier si les arrivées sont déjà là
    let needsUpdate = false;
    for (const f of existingFiles) {
      try {
        const data = JSON.parse(await fs.readFile(path.join(COURSES_DIR, f), 'utf8'));
        for (const c of (data.courses || [])) {
          if (c.participants?.length && !c.participants[0].arrivee) {
            needsUpdate = true;
            break;
          }
        }
      } catch (e) {}
      if (needsUpdate) break;
    }

    if (!needsUpdate) {
      // Vérifier s'il manque les cotes
      for (const f of existingFiles) {
        try {
          const data = JSON.parse(await fs.readFile(path.join(COURSES_DIR, f), 'utf8'));
          for (const c of (data.courses || [])) {
            if (c.participants?.length && (!c.participants[0].cote || c.participants[0].cote < 1)) {
              needsUpdate = true;
              break;
            }
          }
        } catch (e) {}
        if (needsUpdate) break;
      }
    }

    if (!needsUpdate) {
      continue; // Tout est déjà à jour
    }

    process.stdout.write(`${dateISO}: `);

    // Charger le programme pour cette date
    const prog = await apiGet(`programme/${datePmuFormat}?specialisation=INTERNET`);
    if (!prog || !prog.programme?.reunions) {
      console.log('pas de programme');
      continue;
    }

    let updated = 0;

    for (const reunion of prog.programme.reunions) {
      const rNum = reunion.numOfficiel;
      const hippo = (reunion.hippodrome?.libelleCourt || '').toUpperCase();

      for (const courseRaw of (reunion.courses || [])) {
        const cNum = courseRaw.numOrdre;
        totalCourses++;

        await sleep(DELAY);

        // Récupérer détails course (arrivée)
        const courseDetail = await apiGet(`programme/${datePmuFormat}/R${rNum}/C${cNum}`);
        if (!courseDetail) continue;

        const ordreArrivee = {};
        if (courseDetail.ordreArrivee) {
          courseDetail.ordreArrivee.forEach((nums, idx) => {
            if (Array.isArray(nums)) {
              nums.forEach(n => { ordreArrivee[n] = idx + 1; });
            } else {
              ordreArrivee[nums] = idx + 1;
            }
          });
        }

        // Récupérer cotes finales
        await sleep(DELAY);
        const rapports = await apiGet(`programme/${datePmuFormat}/R${rNum}/C${cNum}/rapports/SIMPLE_GAGNANT`);
        const cotesFinales = {};
        if (rapports && rapports.rapportsParticipant) {
          for (const r of rapports.rapportsParticipant) {
            cotesFinales[r.numPmu] = {
              cote: r.rapportDirect || 0,
              coteRef: r.rapportReference || 0
            };
          }
        }

        // Trouver le fichier correspondant et mettre à jour
        for (const f of existingFiles) {
          try {
            const data = JSON.parse(await fs.readFile(path.join(COURSES_DIR, f), 'utf8'));
            if (!data.hippodrome?.toUpperCase().includes(hippo.slice(0, 5))) continue;

            for (const c of (data.courses || [])) {
              if (parseInt(c.numero) !== cNum) continue;

              let courseUpdated = false;
              for (const p of (c.participants || [])) {
                const numPmu = parseInt(p['n°']);
                if (ordreArrivee[numPmu] !== undefined) {
                  p.arrivee = ordreArrivee[numPmu];
                  courseUpdated = true;
                }
                if (cotesFinales[numPmu]) {
                  p.cote = cotesFinales[numPmu].cote;
                  p.cote_reference = cotesFinales[numPmu].coteRef;
                }
              }

              if (courseUpdated) {
                c.arrivee_definitive = true;
                c.participants.sort((a, b) => (a.arrivee || 999) - (b.arrivee || 999));
                updated++;
              }
            }

            await fs.writeFile(path.join(COURSES_DIR, f), JSON.stringify(data, null, 2));
          } catch (e) {}
        }
      }
    }

    totalUpdated += updated;
    console.log(`${updated} courses mises à jour`);
  }

  console.log(`\n✅ ${totalUpdated} courses mises à jour sur ${totalCourses} analysées`);
}

main().catch(err => { console.error('❌', err); process.exit(1); });
