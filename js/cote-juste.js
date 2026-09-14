/* La cote juste : proba réelle de gagner, sachant la cote PMU et le contexte.
 *
 * Miroir exact de bench/cote_juste.py. Le modèle (data/cote_juste.json) est un
 * logit à 17 variables : le marché (log de la proba implicite, corrigée du
 * prélèvement) plus les biais du public mesurés sur 2022-2026 — favori selon
 * le champ et sa cote, dérive, âge, corde, hippodrome, catégorie.
 *
 *   p_juste    = 1 / (1 + exp(-(b0 + Σ w·x)))
 *   cote juste = 1 / p_juste
 *   espérance  = p_juste × cote PMU − 1     → PLAY si ≥ 0, sinon passe
 *
 * Ce n'est pas un classement : c'est « à ce prix, ce cheval vaut-il le pari ».
 * Mesuré sur 2025-2026, jamais vu à l'apprentissage, dividendes réels :
 * PLAY −4,4 % ± 4,9 (n=2 209) ; PLAY sur le favori +4,8 % ± 7,2 (n=567) ;
 * passe −20,4 %. Pas rentable ; pas perdant sur le favori.
 *
 * Variables, dans l'ordre de data/cote_juste.json :
 *   log p marché, log p marché², favori, favori×champ 14+, favori×champ ≤ 9,
 *   favori×cote 4-6, favori×cote 2,5-4, baisse forte −20 %, hausse forte +30 %,
 *   âge 5-6, âge 3, corde ≥ 12, corde 1-3, hippodrome premium,
 *   Longchamp/Saint-Cloud, handicap, log partants
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CoteJuste = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const num = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/[^\d.\-]/g, '')); return isFinite(x) ? x : null; };
  const canon = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

  function age(p) {
    if (p.age != null) return num(p.age);
    const m = String(p.cheval || '').match(/\s(\d+)\s*a\.?\s*$/i);
    return m ? parseInt(m[1], 10) : null;
  }
  function corde(p) {
    const m = String(p.corde == null ? '' : p.corde).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  // Les 17 variables d'un partant. ctx : { hippodrome, course (nom), partants (liste) }
  function variables(p, ctx, modele) {
    const ps = ctx.partants.filter(q => (num(q.cote) || 0) > 1);
    const inv = ps.reduce((s, q) => s + 1 / num(q.cote), 0);
    const c = num(p.cote);
    if (!c || c <= 1 || !inv) return null;
    const fav = Math.min(...ps.map(q => num(q.cote)));
    const n = ps.length;
    const pm = (1 / c) / inv, lp = Math.log(pm);
    const cr = num(p.cote_reference);
    const der = cr && cr > 1 ? (c - cr) / cr : 0;
    const a = age(p), co = corde(p);
    const hip = canon(ctx.hippodrome).replace(/\s+/g, '');
    const premium = (modele.premium || []).map(h => h.replace(/\s+/g, ''));
    const estFav = c === fav ? 1 : 0;
    return [
      lp, lp * lp,
      estFav, estFav && n >= 14 ? 1 : 0, estFav && n <= 9 ? 1 : 0,
      estFav && c >= 4 && c < 6 ? 1 : 0, estFav && c >= 2.5 && c < 4 ? 1 : 0,
      der <= -0.2 ? 1 : 0, der >= 0.3 ? 1 : 0,
      a === 5 || a === 6 ? 1 : 0, a === 3 ? 1 : 0,
      co >= 12 ? 1 : 0, co >= 1 && co <= 3 ? 1 : 0,
      premium.includes(hip) ? 1 : 0, hip === 'PARISLONGCHAMP' || hip === 'SAINT-CLOUD' ? 1 : 0,
      canon(ctx.course).includes('HANDICAP') ? 1 : 0, Math.log(n),
    ];
  }

  function proba(x, modele) {
    let z = modele.intercept;
    for (let i = 0; i < x.length; i++) z += modele.poids[i] * x[i];
    return 1 / (1 + Math.exp(-z));
  }

  // Pour chaque partant : { p, coteJuste, esperance, play, marche } (null si pas de cote)
  function calculer(partants, ctx, modele) {
    const out = new Map();
    for (const p of partants) {
      const x = variables(p, { ...ctx, partants }, modele);
      if (!x) { out.set(p, null); continue; }
      const pj = proba(x, modele), c = num(p.cote);
      out.set(p, { p: pj, coteJuste: 1 / pj, esperance: pj * c - 1, play: pj * c - 1 >= 0, marche: 1 / c, x });
    }
    return out;
  }

  return { variables, proba, calculer, age, corde };
});
