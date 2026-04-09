// claude-matcher.js
// Utilise Claude (via Cloudflare Worker proxy) pour résoudre les noms non matchés
// et enrichir automatiquement la table de correspondance
const fs = require('fs').promises;
const path = require('path');

// URL du proxy Cloudflare (utilisé depuis le navigateur)
// En mode Node.js, utilise directement l'API Anthropic avec la clé
const PROXY_URL = process.env.PROXY_URL || 'https://structboard-proxy.bfrmusic92.workers.dev';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || null;
const DATA_DIR = './data';
const MATCHER_FILE = './data/claude_correspondances.json';

// Charger les noms connus des classements
async function loadKnownNames() {
  const known = { jockeys: [], entraineurs: [], eleveurs: [], proprietaires: [] };

  for (const cat of Object.keys(known)) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(DATA_DIR, `${cat}_ponderated_latest.json`), 'utf8'));
      known[cat] = (data.resultats || []).map(item =>
        (item.Nom || item.NomPostal || '').toUpperCase().trim()
      ).filter(Boolean);
    } catch (e) {}
  }
  return known;
}

// Collecter les noms non matchés des courses récentes
async function collectUnmatchedNames(knownNames) {
  const coursesDir = path.join(DATA_DIR, 'courses');
  const files = (await fs.readdir(coursesDir)).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 30);

  const unmatched = { jockeys: new Set(), entraineurs: new Set() };

  for (const file of files) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(coursesDir, file), 'utf8'));
      for (const course of (data.courses || [])) {
        if (!['Plat', 'Obstacle'].includes(course.type)) continue;

        for (const p of (course.participants || [])) {
          const jockey = (p.jockey || '').trim();
          const entraineur = (p.entraineur || p['entraîneur'] || '').trim();

          if (jockey && jockey.length >= 3) {
            const jUp = jockey.toUpperCase();
            const isKnown = knownNames.jockeys.some(k =>
              k === jUp || k.endsWith(jUp.replace(/^[A-Z]{1,3}\.?\s*/, ''))
            );
            if (!isKnown) unmatched.jockeys.add(jockey);
          }

          if (entraineur && entraineur.length >= 3) {
            const eUp = entraineur.toUpperCase();
            const isKnown = knownNames.entraineurs.some(k =>
              k === eUp || k.endsWith(eUp.replace(/^[A-Z]{1,3}\.?\s*/, ''))
            );
            if (!isKnown) unmatched.entraineurs.add(entraineur);
          }
        }
      }
    } catch (e) {}
  }

  return {
    jockeys: [...unmatched.jockeys].slice(0, 50),
    entraineurs: [...unmatched.entraineurs].slice(0, 50)
  };
}

// Envoyer à Claude pour résolution
async function askClaudeToMatch(unmatchedNames, knownNames) {
  const jockeysList = knownNames.jockeys.slice(0, 300).join('\n');
  const entraineursList = knownNames.entraineurs.slice(0, 400).join('\n');

  const prompt = `Tu es un expert en courses hippiques françaises. Je dois faire correspondre des noms abrégés de jockeys et entraîneurs (provenant des courses PMU) avec leurs noms complets (provenant du classement France Galop).

NOMS ABRÉGÉS NON MATCHÉS - JOCKEYS:
${unmatchedNames.jockeys.join('\n')}

NOMS ABRÉGÉS NON MATCHÉS - ENTRAÎNEURS:
${unmatchedNames.entraineurs.join('\n')}

LISTE DES JOCKEYS CONNUS (classement France Galop):
${jockeysList}

LISTE DES ENTRAÎNEURS CONNUS (classement France Galop):
${entraineursList}

RÈGLES:
- Les noms PMU utilisent souvent des initiales: "T.BACHELOT" = "THEO BACHELOT"
- Les suffixes (S), (Q) indiquent le statut de l'entraîneur, ignore-les pour le matching
- "MME" et "MLLE" sont des titres, cherche avec et sans
- Certains noms sont des étrangers (anglais, argentins, etc.) qui ne sont PAS dans France Galop → marque-les comme "ETRANGER"
- Si tu n'es pas sûr à plus de 80%, marque comme "INCERTAIN"

Réponds UNIQUEMENT en JSON, format:
{
  "correspondances": [
    {"source": "T.BACHELOT", "match": "THEO BACHELOT", "categorie": "jockeys", "confiance": 95},
    {"source": "WILLIAM BUICK", "match": "ETRANGER", "categorie": "jockeys", "confiance": 99},
    {"source": "L.CL. ABRIVARD", "match": "INCERTAIN", "categorie": "jockeys", "confiance": 30}
  ]
}`;

  console.log(`Envoi de ${unmatchedNames.jockeys.length} jockeys + ${unmatchedNames.entraineurs.length} entraîneurs à Claude...`);

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  });

  try {
    let response;

    if (ANTHROPIC_API_KEY) {
      // Mode direct API Anthropic
      const https = require('https');
      response = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          }
        }, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, text: () => Promise.resolve(data), json: () => Promise.resolve(JSON.parse(data)) }));
        });
        req.on('error', reject);
        req.write(requestBody);
        req.end();
      });
    } else {
      // Mode proxy Cloudflare
      response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Erreur HTTP ${response.status}: ${errText}`);
      return null;
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    // Extraire le JSON de la réponse
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ Pas de JSON dans la réponse de Claude');
      console.log('Réponse brute:', text.slice(0, 500));
      return null;
    }

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('❌ Erreur lors de l\'appel Claude:', err.message);
    return null;
  }
}

// Sauvegarder les correspondances découvertes
async function saveCorrespondances(claudeResult) {
  // Charger les correspondances existantes
  let existing = {};
  try {
    existing = JSON.parse(await fs.readFile(MATCHER_FILE, 'utf8'));
  } catch (e) {
    existing = { correspondances: {}, etrangers: [], incertains: [], meta: {} };
  }

  let added = 0;
  let etrangers = 0;
  let incertains = 0;

  for (const item of (claudeResult.correspondances || [])) {
    const source = item.source.toUpperCase().trim();

    if (item.match === 'ETRANGER') {
      if (!existing.etrangers.includes(source)) {
        existing.etrangers.push(source);
        etrangers++;
      }
    } else if (item.match === 'INCERTAIN') {
      if (!existing.incertains.includes(source)) {
        existing.incertains.push(source);
        incertains++;
      }
    } else if (item.confiance >= 80) {
      existing.correspondances[source] = {
        match: item.match.toUpperCase().trim(),
        categorie: item.categorie,
        confiance: item.confiance,
        date: new Date().toISOString().split('T')[0]
      };
      added++;
    }
  }

  existing.meta = {
    derniere_maj: new Date().toISOString(),
    total_correspondances: Object.keys(existing.correspondances).length,
    total_etrangers: existing.etrangers.length,
    total_incertains: existing.incertains.length
  };

  await fs.writeFile(MATCHER_FILE, JSON.stringify(existing, null, 2));

  console.log(`\n✅ Résultats sauvegardés dans ${MATCHER_FILE}:`);
  console.log(`   ${added} nouvelles correspondances`);
  console.log(`   ${etrangers} étrangers identifiés`);
  console.log(`   ${incertains} incertains`);
  console.log(`   Total: ${existing.meta.total_correspondances} correspondances connues`);

  return existing;
}

// Générer le code JS pour ranking-loader.js
async function generateCorrespondanceJS() {
  let data;
  try {
    data = JSON.parse(await fs.readFile(MATCHER_FILE, 'utf8'));
  } catch (e) {
    console.log('Pas de fichier de correspondances Claude');
    return;
  }

  const lines = [];
  for (const [source, info] of Object.entries(data.correspondances || {})) {
    lines.push(`        "${source}": "${info.match}",`);
  }
  // Étrangers → match vide pour ne pas chercher indéfiniment
  for (const name of (data.etrangers || [])) {
    lines.push(`        // "${name}": "ETRANGER",`);
  }

  console.log('\n=== CODE À AJOUTER DANS correspondanceManuelle (ranking-loader.js) ===');
  console.log('// Correspondances découvertes par Claude');
  console.log(lines.join('\n'));
}

// Main
async function main() {
  const command = process.argv[2] || 'run';

  console.log('=== CLAUDE MATCHER — Résolution des noms non matchés ===\n');

  const knownNames = await loadKnownNames();
  console.log(`Noms connus: ${knownNames.jockeys.length} jockeys, ${knownNames.entraineurs.length} entraîneurs`);

  if (command === 'run' || command === 'match') {
    const unmatched = await collectUnmatchedNames(knownNames);
    console.log(`Non matchés: ${unmatched.jockeys.length} jockeys, ${unmatched.entraineurs.length} entraîneurs\n`);

    if (unmatched.jockeys.length === 0 && unmatched.entraineurs.length === 0) {
      console.log('✅ Tous les noms sont déjà matchés !');
      return;
    }

    const claudeResult = await askClaudeToMatch(unmatched, knownNames);
    if (claudeResult) {
      await saveCorrespondances(claudeResult);
    }
  }

  if (command === 'generate' || command === 'run') {
    await generateCorrespondanceJS();
  }
}

main().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
