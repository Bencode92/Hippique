/**
 * Panneau de décision — pour UNE course : la probabilité de chaque cheval,
 * puis quel pari a le plus de sens.
 *
 *   const p = PanneauParis.pourCourse(participants);
 *   p.recommandation  → { pari, chevaux, p, ev, pourquoi }
 *   p.simple / p.couple / p.trio / p.deuxSurQuatre
 *
 * TROIS BRIQUES, toutes calibrées sur les données du repo.
 *
 * 1. PROBABILITÉ — p = (1/cote) / Σ(1/cote), puis correction favori/outsider
 *    mesurée sur 159 103 partants : un cheval à 1,3 % affiché n'en gagne que
 *    0,9 % (ratio 0,683), un gros favori en gagne 9 % de plus (1,090).
 *
 * 2. COMBINAISONS — modèle de Harville corrigé à la Henery/Stern : les
 *    probabilités sont élevées à la puissance λ pour les positions 2 et 3.
 *    λ = 0,85 estimé par maximum de vraisemblance sur les arrivées 2022-2023
 *    (Harville pur = 1,00, qui surestime les favoris en 2e position).
 *
 * 3. ESPÉRANCE — deux régimes, selon ce qu'on sait prédire :
 *      · SIMPLE GAGNANT : exact et propre à la course. Le dividende EST la
 *        cote, donc EV = p_corrigée × cote − 1. Vérifié : le rapport se prédit
 *        depuis les masses du pool à 1,6 % d'erreur médiane.
 *      · COMBINÉS : moyenne mesurée par composition de rangs du marché, sur
 *        13 000 à 17 000 courses. Le dividende d'un couplé ou d'un trio ne se
 *        prédit qu'à 15-23 % près depuis les masses (l'API tronque les pools
 *        aux 12 plus grosses combinaisons), donc la table empirique est plus
 *        fiable que le calcul. Ces espérances sont des moyennes, pas des
 *        valeurs propres à la course.
 *
 * Aucune espérance n'est positive : le prélèvement mesuré va de 14 % au simple
 * gagnant à 31 % au trio. Ce panneau ne désigne pas un pari gagnant, il classe
 * les paris par coût — et l'écart entre le meilleur et le pire dépasse 30 points.
 */
const PanneauParis = (() => {
  const LAMBDA = 0.85;

  // Correction favori/outsider : [borne basse, borne haute, ratio observé/implicite]
  const CORRECTION = [
    [0.000, 0.020, 0.683], [0.020, 0.040, 0.884], [0.040, 0.070, 0.968],
    [0.070, 0.110, 0.995], [0.110, 0.170, 1.023], [0.170, 0.250, 1.045],
    [0.250, 0.350, 1.047], [0.350, 1.000, 1.090],
  ];

  // Gain moyen encaissé pour 1 € misé, par composition de rangs du marché.
  // CORRECTIF : ne sont comptées que les courses où le pari était RÉELLEMENT
  // PROPOSÉ. Le 2 sur 4 n'est offert que sur 64 % des courses et le trio sur
  // 80 % ; compter les autres comme des mises perdues déflatait leur espérance
  // de 20 et 4 points. Le simple gagnant et le couplé sont offerts partout,
  // leurs chiffres étaient donc justes.
  const EV = {
    gagnant: {'0':0.8697,'1':0.865,'2':0.8636,'3':0.8307,'4':0.8181},
    couple: {'0-1':0.8729,'0-2':0.832,'0-3':0.81,'0-4':0.8071,'1-2':0.8693,'1-3':0.8312,'1-4':0.7409,'2-3':0.7601,'2-4':0.8045,'3-4':0.7623},
    trio: {'0-1-2':0.7022,'0-1-3':0.7521,'0-1-4':0.7639,'0-2-3':0.7804,'0-2-4':0.7695,'0-3-4':0.7602,'1-2-3':0.7938,'1-2-4':0.8352,'1-3-4':0.7478,'2-3-4':0.583},
    deuxSurQuatre: {'0-1':0.8752,'0-2':0.8985,'0-3':0.8708,'0-4':0.8333,'1-2':0.8574,'1-3':0.8451,'1-4':0.7989,'2-3':0.7704,'2-4':0.7502,'3-4':0.7285},
  };
  const PRELEVEMENT = { gagnant: 0.14, couple: 0.26, trio: 0.31, deuxSurQuatre: 0.26 };

  const ratio = (p) => (CORRECTION.find(([lo, hi]) => p >= lo && p < hi) || [0, 0, 1])[2];

  /** Probabilités de victoire corrigées, renormalisées à 1. */
  function probabilites(parts) {
    const cotes = parts.map((p) => parseFloat(p.cote) || 0);
    const inv = cotes.reduce((s, c) => s + (c > 1 ? 1 / c : 0), 0);
    if (!inv) return parts.map(() => 0);
    const brut = cotes.map((c) => (c > 1 ? (1 / c) / inv : 0));
    const corr = brut.map((p) => p * ratio(p));
    const som = corr.reduce((a, b) => a + b, 0);
    return corr.map((p) => p / som);
  }

  /** P(ordre a puis b puis c), modèle de Stern. */
  function pOrdre(P, a, b, c) {
    const n = P.length;
    let s1 = 0; for (let k = 0; k < n; k++) if (k !== a) s1 += Math.pow(P[k], LAMBDA);
    if (s1 <= 0) return 0;
    let s2 = 0; for (let k = 0; k < n; k++) if (k !== a && k !== b) s2 += Math.pow(P[k], LAMBDA);
    if (s2 <= 0) return 0;
    return P[a] * (Math.pow(P[b], LAMBDA) / s1) * (Math.pow(P[c], LAMBDA) / s2);
  }
  /** P(i et j tous deux dans les 3 premiers). */
  function pDansTop3(P, i, j) {
    let t = 0;
    for (let k = 0; k < P.length; k++) {
      if (k === i || k === j) continue;
      t += pOrdre(P, i, j, k) + pOrdre(P, j, i, k) + pOrdre(P, i, k, j)
         + pOrdre(P, j, k, i) + pOrdre(P, k, i, j) + pOrdre(P, k, j, i);
    }
    return t;
  }
  /** P(les trois occupent les 3 premières places, dans le désordre). */
  function pTrio(P, i, j, k) {
    return pOrdre(P, i, j, k) + pOrdre(P, i, k, j) + pOrdre(P, j, i, k)
         + pOrdre(P, j, k, i) + pOrdre(P, k, i, j) + pOrdre(P, k, j, i);
  }

  /** Σ(1/cote) attendu en pari mutuel : médiane 1,18 sur 17 534 courses réelles,
   *  1er centile 1,10, 99e centile 1,47 — les petits pelotons montent naturellement
   *  plus haut. Hors de [1,03 ; 1,60] les
   *  cotes sont incomplètes (partants manquants, non-partants, données partielles)
   *  et toute probabilité qu'on en tirerait serait fausse — on refuse de calculer
   *  plutôt que d'afficher une espérance absurde. */
  const OVERROUND_MIN = 1.03, OVERROUND_MAX = 1.60;

  function pourCourse(participants, { profondeur = 5 } = {}) {
    const parts = (participants || [])
      .filter((p) => (parseFloat(p.cote) || 0) > 1)
      .sort((a, b) => parseFloat(a.cote) - parseFloat(b.cote));
    if (parts.length < 5) return null;
    const overround = parts.reduce((s, p) => s + 1 / parseFloat(p.cote), 0);
    if (overround < OVERROUND_MIN || overround > OVERROUND_MAX) {
      return { incomplet: true, overround,
               raison: `cotes incomplètes — Σ(1/cote) = ${overround.toFixed(2)}, attendu entre 1,03 et 1,60`,
               simple: [], couple: [], trio: [], deuxSurQuatre: [], recommandation: null };
    }
    const P = probabilites(parts);
    const nom = (p) => p.cheval || p.nom || `#${p['n°'] || p.numero || ''}`;
    const k = Math.min(profondeur, parts.length);
    const ev = (fam, rangs) => {
      const g = EV[fam][rangs.join('-')];
      return g === undefined ? null : g - 1;
    };

    // SIMPLE GAGNANT : espérance exacte, propre à cette course
    const simple = [];
    for (let i = 0; i < k; i++) {
      const cote = parseFloat(parts[i].cote);
      simple.push({ pari: 'simple gagnant', chevaux: [nom(parts[i])], rangs: [i],
                    p: P[i], cote, ev: P[i] * cote - 1, exact: true });
    }
    const couple = [], trio = [], d4 = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      couple.push({ pari: 'couplé gagnant', chevaux: [nom(parts[i]), nom(parts[j])],
                    rangs: [i, j], p: P[i] * P[j] / (1 - P[i]) + P[j] * P[i] / (1 - P[j]),
                    ev: ev('couple', [i, j]), exact: false });
      d4.push({ pari: '2 sur 4', chevaux: [nom(parts[i]), nom(parts[j])], rangs: [i, j],
                p: pDansTop3(P, i, j), ev: ev('deuxSurQuatre', [i, j]), exact: false });
      for (let l = j + 1; l < k; l++)
        trio.push({ pari: 'trio', chevaux: [nom(parts[i]), nom(parts[j]), nom(parts[l])],
                    rangs: [i, j, l], p: pTrio(P, i, j, l), ev: ev('trio', [i, j, l]), exact: false });
    }
    const propre = (a) => a.filter((x) => x.ev !== null && isFinite(x.ev))
                           .sort((x, y) => y.p - x.p);
    const S = propre(simple), C = propre(couple), T = propre(trio), D = propre(d4);
    const tous = [...S, ...C, ...T, ...D];
    const best = tous.reduce((a, b) => (b.ev > a.ev ? b : a), tous[0]);
    const marqueMeilleur = (l) => { if (!l.length) return; const m = Math.max(...l.map((x) => x.ev));
                                    l.forEach((x) => { x.meilleureEv = x.ev === m; }); };
    [S, C, T, D].forEach(marqueMeilleur);
    return {
      simple: S, couple: C, trio: T, deuxSurQuatre: D,
      recommandation: best && {
        pari: best.pari, chevaux: best.chevaux, p: best.p, ev: best.ev,
        pourquoi: `${(best.p * 100).toFixed(1)} % de chances, espérance ${(best.ev * 100).toFixed(1)} %`
                + ` — le moins coûteux des ${tous.length} paris possibles de cette course`,
      },
      prelevement: PRELEVEMENT,
    };
  }

  return { pourCourse, probabilites, LAMBDA };
})();
if (typeof module !== 'undefined') module.exports = PanneauParis;
if (typeof window !== 'undefined') window.PanneauParis = PanneauParis;
