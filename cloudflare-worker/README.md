# pmu-proxy — relais CORS vers l'API PMU

## Le problème

```
GET online.turfinfo.api.pmu.fr/rest/client/61/programme/05092026
  sans en-tête Origin            → 200 OK
  Origin: bencode92.github.io    → 403 Forbidden   (vary: Origin, CloudFront)
```

Un `fetch()` de navigateur envoie **toujours** `Origin`. La page ne peut donc
pas interroger le PMU, quoi qu'on fasse côté client. C'est pour ça que
`live-scoring.js` fonctionne en Node et n'a aucun équivalent dans le front.

Sans relais, les cotes du site passent par la chaîne
`cron */10 → file d'attente Actions → commit → push → CDN raw`, soit **2 à 20
minutes de retard** au moment où on parie — et rien du tout après 22 h.

## Déploiement

```bash
cd cloudflare-worker
npx wrangler login          # une seule fois
npx wrangler deploy
```

`wrangler` affiche l'URL, du type `https://pmu-proxy.<compte>.workers.dev`.

## Activation dans le site

Dans `index.html`, renseigner la constante :

```js
const PMU_PROXY = 'https://pmu-proxy.<compte>.workers.dev';
```

Vide = désactivé : le bouton « Cotes live » retombe sur `data/cotes_live/`,
comportement actuel inchangé. Le repli s'applique aussi si le Worker ne répond
pas — le site ne dépend jamais de lui.

## Vérification

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Origin: https://bencode92.github.io' \
  https://pmu-proxy.<compte>.workers.dev/programme/05092026
# 200 attendu — contre 403 en tapant le PMU en direct
```

## Garde-fous

- Deux chemins relayés seulement : `programme/{DDMMYYYY}` et
  `programme/{DDMMYYYY}/R{n}/C{n}/participants`. Ce n'est pas un proxy ouvert.
- Origines autorisées codées en dur dans `ORIGINES` — ajouter la sienne pour
  tester en local sur un autre port.
- 15 s de cache périphérique : absorbe les rafales sans jamais servir une cote
  vieille de plus d'un quart de minute.

## Ce que le cron devient

`scrape-pre-course.yml` reste utile : il archive les cotes pré-course dans
`data/cotes_live/`, ce qui alimente le backtest et la dérive de cote. Il sort
simplement du chemin de décision au moment du pari.
