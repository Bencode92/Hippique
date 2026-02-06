// extract-pondered-rankings.js
// Script pour extraire les classements pondérés par catégorie
// avec identifiant robuste (URL ID France Galop) pour jointure fiable

const fs = require('fs');
const path = require('path');

// ── Configuration des champs par catégorie ──────────────────────────
const BASE_URL = 'https://www.france-galop.com';

const CATEGORY_FIELDS = {
    chevaux:       { name: 'LibelleCheval', url: 'LibelleCheval_url' },
    jockeys:       { name: 'NomPostal',     url: 'NomPostal_url' },
    entraineurs:   { name: 'NomPostal',     url: 'NomPostal_url' },
    eleveurs:      { name: 'NomPostal',     url: 'NomPostal_url' },
    proprietaires: { name: 'NomPostal',     url: 'NomPostal_url' },
};

// ── Helpers URL → ID ────────────────────────────────────────────────

/**
 * Canonise une URL France Galop :
 * - relative → absolue
 * - supprime trailing slash, query params, hash
 */
function canonicalizeUrl(u) {
    if (!u || typeof u !== 'string') return null;
    let s = u.trim();
    if (!s) return null;

    // URL relative → absolue
    if (s.startsWith('/')) s = BASE_URL + s;

    try {
        const urlObj = new URL(s);
        urlObj.hash = '';
        urlObj.search = '';
        return urlObj.toString().replace(/\/$/, '');
    } catch {
        // fallback si URL malformée
        return s.replace(/\/$/, '');
    }
}

/**
 * Extrait l'identifiant unique (dernier segment de l'URL = base64 ID France Galop)
 */
function urlToId(u) {
    const cu = canonicalizeUrl(u);
    if (!cu) return null;
    const parts = cu.split('/');
    return parts[parts.length - 1] || null;
}

// ── Script principal ────────────────────────────────────────────────

async function extractPonderedRankings() {
    const categories = ['jockeys', 'chevaux', 'entraineurs', 'eleveurs', 'proprietaires'];
    const date = new Date().toISOString().split('T')[0];
    const kpiSummary = {};

    console.log(`Extraction des classements pondérés pour le ${date}`);

    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log(`Répertoire créé: ${dataDir}`);
    }

    for (const category of categories) {
        try {
            console.log(`\nTraitement: ${category}`);

            const sourceFilePath = path.join(dataDir, `${category}.json`);
            if (!fs.existsSync(sourceFilePath)) {
                console.warn(`Fichier source non trouvé: ${sourceFilePath}`);
                continue;
            }

            const rawData = fs.readFileSync(sourceFilePath, 'utf8');
            const data = JSON.parse(rawData);

            if (!data.resultats || !Array.isArray(data.resultats)) {
                console.warn(`Données invalides pour ${category}, fichier ignoré`);
                continue;
            }

            const fields = CATEGORY_FIELDS[category];
            if (!fields) {
                console.warn(`Champs non définis pour ${category}`);
                continue;
            }

            // ── Extraction avec ID robuste ──
            const rankings = data.resultats
                .filter(item => item.Rang !== undefined && item.Rang !== null)
                .map(item => {
                    const rawUrl = item[fields.url] || null;
                    const id = urlToId(rawUrl);
                    const url = canonicalizeUrl(rawUrl);

                    return {
                        id,
                        url: url || null,
                        nom: item[fields.name] || 'Inconnu',
                        rang: parseInt(item.Rang, 10),
                    };
                });

            // ── KPI couverture ID ──
            const withId = rankings.filter(r => r.id !== null).length;
            const withoutId = rankings.length - withId;
            const coveragePct = rankings.length > 0
                ? ((withId / rankings.length) * 100).toFixed(1)
                : '0.0';

            // Détection doublons ID
            const seen = new Set();
            let duplicates = 0;
            for (const r of rankings) {
                if (!r.id) continue;
                if (seen.has(r.id)) duplicates++;
                else seen.add(r.id);
            }

            kpiSummary[category] = {
                total: rankings.length,
                with_id: withId,
                without_id: withoutId,
                coverage_pct: parseFloat(coveragePct),
                duplicates,
            };

            console.log(`  ${rankings.length} rangs extraits`);
            console.log(`  ID couverture: ${withId}/${rankings.length} (${coveragePct}%)`);
            if (withoutId > 0) {
                console.warn(`  ⚠️ ${withoutId} item(s) sans URL ID`);
            }
            if (duplicates > 0) {
                console.warn(`  ⚠️ ${duplicates} doublon(s) ID détecté(s)`);
            }

            // ── Sortie JSON ──
            const output = {
                metadata: {
                    category,
                    date_extraction: date,
                    description: `Classement ${category} avec ID France Galop pour jointure`,
                    nombre_items: rankings.length,
                    kpi: kpiSummary[category],
                },
                rangs: rankings.map(({ id, nom, rang, url }) => ({ id, nom, rang, url })),
            };

            const outputFilePath = path.join(dataDir, `ranking-${category}.json`);
            fs.writeFileSync(outputFilePath, JSON.stringify(output, null, 2), 'utf8');
            console.log(`  Fichier créé: ${outputFilePath}`);

        } catch (error) {
            console.error(`Erreur pour ${category}:`, error);
        }
    }

    // ── Rapport KPI global ──
    console.log('\n══════ KPI COUVERTURE ID ══════');
    for (const [cat, kpi] of Object.entries(kpiSummary)) {
        const status = kpi.coverage_pct >= 99 ? '✅' : kpi.coverage_pct >= 90 ? '⚠️' : '❌';
        console.log(`  ${status} ${cat}: ${kpi.coverage_pct}% (${kpi.with_id}/${kpi.total}) | doublons: ${kpi.duplicates}`);
    }
    console.log('═══════════════════════════════\n');

    console.log('Extraction terminée.');
}

extractPonderedRankings().catch(console.error);
