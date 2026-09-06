/**
 * Relais CORS vers l'API PMU Turfinfo.
 *
 * Pourquoi ce Worker existe : l'API PMU répond 200 sans en-tête Origin, et
 * 403 dès qu'un Origin est présent (`vary: Origin`, blocage CloudFront).
 * Un fetch() de navigateur envoie toujours Origin — la page ne peut donc
 * jamais appeler l'API directement. Le relais fait l'appel côté serveur et
 * rajoute les en-têtes CORS.
 *
 * Intérêt : au moment du pari (T−1 min), la cote a l'âge de la requête, au
 * lieu des 2 à 20 minutes qu'impose la chaîne cron → runner → commit → CDN.
 *
 * Déploiement : voir README.md de ce dossier.
 */

const PMU = 'https://online.turfinfo.api.pmu.fr/rest/client/61';

// Seules ces origines peuvent appeler le Worker.
const ORIGINES = new Set([
  'https://bencode92.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);

// Liste blanche des chemins relayés — le Worker n'est pas un proxy ouvert.
const CHEMINS = [
  /^programme\/\d{8}$/,
  /^programme\/\d{8}\/R\d+\/C\d+\/participants$/,
];

function entetes(origin) {
  const h = {
    'Access-Control-Allow-Origin': ORIGINES.has(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  return h;
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = entetes(origin);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') {
      return new Response('méthode non autorisée', { status: 405, headers: cors });
    }
    if (origin && !ORIGINES.has(origin)) {
      return new Response('origine non autorisée', { status: 403, headers: cors });
    }

    const chemin = new URL(request.url).pathname.replace(/^\/+/, '');
    if (!CHEMINS.some((re) => re.test(chemin))) {
      return new Response('chemin non relayé', { status: 400, headers: cors });
    }

    // L'appel sortant du Worker ne porte pas d'Origin : le PMU répond 200.
    const amont = await fetch(`${PMU}/${chemin}?specialisation=INTERNET`, {
      headers: { 'Accept': 'application/json' },
      // 15 s de cache périphérique : absorbe les rafales sans jamais servir
      // une cote périmée au-delà d'un quart de minute.
      cf: { cacheTtl: 15, cacheEverything: true },
    });

    if (!amont.ok) {
      return new Response(`amont ${amont.status}`, { status: 502, headers: cors });
    }

    return new Response(amont.body, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=15',
      },
    });
  },
};
