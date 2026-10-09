/* Lecture d'un horodatage de relevé, sans dépendre du fuseau du processus.
 *
 * Mesuré le 09/10/2026 : bench/sprt_regle.mjs trouvait 8 paris sur ma machine
 * (TZ=Europe/Paris) et 0 sur le runner GitHub (TZ=UTC), qui écrasait le journal
 * réel avec un journal vide — 12 courses « sans relevé dans la fenêtre » alors
 * que les relevés existaient. Même cause pour les cotes live absentes des
 * fiches du jour : `dernier` et `fenetre` tombaient à null.
 *
 * Origine : scraper_pre_course.py écrivait `datetime.now().isoformat()`, donc
 * une heure locale NAÏVE, et le workflow du scraper fixe TZ=Europe/Paris alors
 * que les autres non. `new Date('2026-10-04T18:31:00')` vaut alors 18h31 Paris
 * ici et 18h31 UTC là-bas : deux heures d'écart, et un relevé de T-2 min
 * devient un relevé d'après le départ.
 *
 * Le scraper écrit désormais l'offset ; pour tout l'historique déjà en dépôt,
 * un horodatage sans fuseau est lu comme une heure de Paris — ce qu'il est.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Temps = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PARIS = 'Europe/Paris';
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: PARIS, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  // Décalage de Paris (ms) à cet instant : positif en été (+2 h), +1 h en hiver.
  function offsetParis(ms) {
    const p = {};
    for (const x of fmt.formatToParts(ms)) if (x.type !== 'literal') p[x.type] = +x.value;
    return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - ms;
  }

  /* ms depuis l'époque. Avec fuseau explicite (Z ou ±hh:mm) : tel quel.
   * Sans fuseau : interprété en heure de Paris. */
  function ms(s) {
    if (s == null) return null;
    if (typeof s === 'number') return s;
    const t = String(s).trim();
    if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(t)) { const v = new Date(t).getTime(); return isFinite(v) ? v : null; }
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) { const v = new Date(t).getTime(); return isFinite(v) ? v : null; }
    const brut = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    return brut - offsetParis(brut);
  }

  // Secondes entre un relevé et le départ (positif = avant le départ).
  function secAvant(depart, scrapedAt) {
    const d = ms(depart), t = ms(scrapedAt);
    return d == null || t == null ? null : (d - t) / 1000;
  }

  return { ms, secAvant, offsetParis };
});
