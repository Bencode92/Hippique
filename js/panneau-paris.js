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

  // Gain moyen encaissé pour 1 € misé, par composition de rangs du marché (0 =
  // favori) et par profil d'ouverture. Régénéré par bench/gen_ev_compositions.mjs
  // sur 14 547 courses (plat FR, 8 partants et plus, Σ(1/cote) dans [1,03 ; 1,60]).
  //
  // Pourquoi par profil : le couplé des rangs 1-2 vaut -12,4 % toutes courses
  // confondues mais -4,5 % sur une course fermée et -39,6 % sur une course
  // ouverte. La table précédente ne donnait que la moyenne générale, à côté
  // d'une recommandation calculée par profil — le couplé paraissait donc pire
  // que le simple là où il est en réalité le meilleur choix.
  //
  // Une composition n'apparaît dans son profil QUE si son écart à la moyenne
  // générale dépasse son intervalle de confiance : 15 sur 140 l'ont fait, les
  // 125 autres retombent sur `global`. Sans cette règle, un trio mesuré à
  // +1,9 % sur un profil (écart +22 pt, IC ±26) se serait affiché comme une
  // espérance positive, alors que le prélèvement du trio est de 31 %.
  //
  // Ne sont comptées que les courses où le pari était RÉELLEMENT PROPOSÉ : le
  // 2 sur 4 n'est pas offert partout, et compter les autres comme des mises
  // perdues déflatait son espérance de 20 points.
  const EV_PROFILS = {
    fermee: {
      gagnant: {'3':0.7456},
      couple: {'0-1':0.9547, '1-3':0.6971},
      trio: {'1-3-4':0.5051},
      deuxSurQuatre: {'0-1':0.936, '1-2':0.7815, '1-3':0.7117, '1-4':0.6224, '2-3':0.6726, '2-4':0.5587, '3-4':0.4893}
    },
    moyenne: {},
    assez_ouverte: {
      deuxSurQuatre: {'3-4':0.8618}
    },
    ouverte: {
      couple: {'0-1':0.6038},
      trio: {'0-1-2':0.3761, '1-2-4':0.3838}
    },
    global: {
      gagnant: {'0':0.8716, '1':0.8653, '2':0.8644, '3':0.8324, '4':0.8163},
      couple: {'0-1':0.8765, '0-2':0.8341, '0-3':0.8129, '0-4':0.8094, '1-2':0.8696, '1-3':0.8324, '1-4':0.7411, '2-3':0.7623, '2-4':0.8047, '3-4':0.7624},
      trio: {'0-1-2':0.7047, '0-1-3':0.7555, '0-1-4':0.7659, '0-2-3':0.7843, '0-2-4':0.7731, '0-3-4':0.7624, '1-2-3':0.7959, '1-2-4':0.8395, '1-3-4':0.7467, '2-3-4':0.5787},
      deuxSurQuatre: {'0-1':0.8767, '0-2':0.8993, '0-3':0.8729, '0-4':0.8362, '1-2':0.858, '1-3':0.8457, '1-4':0.7982, '2-3':0.7715, '2-4':0.7498, '3-4':0.7287}
    }
  };

  const PRELEVEMENT = { gagnant: 0.14, couple: 0.26, trio: 0.31, deuxSurQuatre: 0.26 };

  // Quel instrument selon l'OUVERTURE de la course, mesuré par la probabilité
  // implicite du favori. Gain moyen encaissé pour 1 € misé, sur 14 547 courses.
  // Le choix qui ressort de chaque profil est stable entre 2022-2023 et
  // 2024-2026 : couplé en course fermée, 2 sur 4 en course moyenne, simple en
  // course ouverte — où le couplé s'effondre à -33 %.
  //   simple   = le favori seul
  //   couple   = couplé gagnant sur les deux favoris ; couple02 = favori + 3e
  //   d4 / d402 = 2 sur 4, mêmes paires
  //   trio     = les trois premiers du marché
  // libellé affiché → clé de EV_PROFILS
  const CLE_EV = { 'course fermée':'fermee', 'course moyenne':'moyenne',
                   'course assez ouverte':'assez_ouverte', 'course ouverte':'ouverte' };
  const PROFILS = {
    'course fermée': { pMin:0.28, pMax:1.01, n:4555, simple:0.8999,simpleSe:1.7, couple:0.9547,coupleSe:3.2, couple02:0.8705,couple02Se:3.8, d4:0.936,d4Se:2.2, d402:0.9404,d402Se:2.8, trio:0.7938,trioSe:3.7 },
    'course moyenne': { pMin:0.22, pMax:0.28, n:4050, simple:0.8622,simpleSe:2.3, couple:0.8606,coupleSe:4.1, couple02:0.8314,couple02Se:4.8, d4:0.9299,d4Se:2.5, d402:0.9045,d402Se:3.0, trio:0.7772,trioSe:5.5 },
    'course assez ouverte': { pMin:0.17, pMax:0.22, n:4042, simple:0.8455,simpleSe:2.7, couple:0.9009,coupleSe:5.1, couple02:0.7426,couple02Se:5.0, d4:0.8408,d4Se:2.6, d402:0.8806,d402Se:3.1, trio:0.6466,trioSe:6.1 },
    'course ouverte': { pMin:0, pMax:0.17, n:1900, simple:0.8926,simpleSe:4.7, couple:0.6713,coupleSe:7.7, couple02:0.9472,couple02Se:10.9, d4:0.7826,d4Se:4.3, d402:0.8738,d402Se:5.4, trio:0.4128,trioSe:8.4 }
  };
  const LIB = { simple: 'simple gagnant', couple: 'couplé gagnant',
                couple02: 'couplé gagnant (favori + 3e)', d4: '2 sur 4',
                d402: '2 sur 4 (favori + 3e)', trio: 'trio' };
  const RANGS = { simple: [0], couple: [0, 1], couple02: [0, 2],
                  d4: [0, 1], d402: [0, 2], trio: [0, 1, 2] };

  /** Profil d'ouverture d'après la probabilité corrigée du favori. */
  function profilCourse(pFavori) {
    for (const [nom, d] of Object.entries(PROFILS))
      if (pFavori >= d.pMin && pFavori < d.pMax) return { nom, ...d };
    return null;
  }

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
    // Le profil doit être connu AVANT de calculer les espérances des combinés :
    // c'est lui qui choisit la ligne de la table.
    const profilEv = profilCourse(P[0]);
    const cleProfil = (profilEv && EV_PROFILS[CLE_EV[profilEv.nom]]) ? CLE_EV[profilEv.nom] : 'global';
    const ev = (fam, rangs) => {
      const k = rangs.join('-');
      const t = EV_PROFILS[cleProfil];
      const g = (t && t[fam] && t[fam][k] !== undefined) ? t[fam][k] : EV_PROFILS.global[fam][k];
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
    // Profil de la course et instrument qui en ressort
    const prof = profilEv;
    let reco = null;
    const choix = pariDuProfil(prof);
    if (prof && choix) {
      const meilleur = choix.cle;
      const rangs = RANGS[meilleur];
      if (rangs.every((r) => r < parts.length)) {
        reco = {
          pari: LIB[meilleur], profil: prof.nom,
          chevaux: rangs.map((r) => nom(parts[r])),
          ev: prof[meilleur] - 1,
          pourquoi: `${prof.nom} — sur ${prof.n.toLocaleString('fr-FR')} courses de ce profil,`
                  + ` ${((prof[meilleur] - 1) * 100).toFixed(1)} %`
                  + (choix.ecarte
                     ? `. Le ${choix.ecarte.instrument} y rend ${choix.ecarte.ecart.toFixed(1)} points de plus,`
                       + ` mais l'écart n'est pas démontré (t = ${choix.ecarte.t.toFixed(2)}) : on reste au simple gagnant.`
                     : `, écart au simple gagnant démontré (t = ${(choix.ecarte === null && prof.simpleSe ? (100*(prof[meilleur]-prof.simple))/Math.sqrt((prof[meilleur+'Se']||0)**2+(prof.simpleSe||0)**2) : 0).toFixed(2)})`),
        };
      }
    }
    const propre = (a) => a.filter((x) => x.ev !== null && isFinite(x.ev))
                           .sort((x, y) => y.p - x.p);
    const S = propre(simple), C = propre(couple), T = propre(trio), D = propre(d4);
    const marqueMeilleur = (l) => { if (!l.length) return; const m = Math.max(...l.map((x) => x.ev));
                                    l.forEach((x) => { x.meilleureEv = x.ev === m; }); };
    [S, C, T, D].forEach(marqueMeilleur);
    return {
      simple: S, couple: C, trio: T, deuxSurQuatre: D,
      profil: prof,
      // La recommandation vient de la table PAR PROFIL, mesurée et stable entre
      // les deux périodes — et non du minimum des 35 espérances de la course,
      // qui serait le maximum d'un tirage et donc optimiste.
      recommandation: reco,
      prelevement: PRELEVEMENT,
    };
  }

  /** Instrument le moins coûteux pour un profil, sans calculer les 35 paris.
   *  Sert à l'affichage de liste, où l'on veut le nom du pari et son coût
   *  moyen mais pas le détail des combinaisons. */
  function pariDuProfil(prof) {
    if (!prof) return null;
    const cles = Object.keys(LIB).filter((k) => typeof prof[k] === 'number');
    if (!cles.length) return null;
    const meilleur = cles.reduce((a, b) => (prof[b] > prof[a] ? b : a));
    if (meilleur === 'simple' || typeof prof.simple !== 'number')
      return { cle: meilleur, pari: LIB[meilleur], rangs: RANGS[meilleur], ev: prof[meilleur] - 1 };

    // On n'écarte le simple gagnant que si l'écart est DÉMONTRÉ. Sur les quatre
    // profils, un seul l'est :
    //     fermée        couplé  +5,5 ± 3,6  t = 1,51   dans le bruit
    //     moyenne       2 sur 4 +6,8 ± 3,4  t = 1,99   significatif
    //     assez ouverte couplé  +5,5 ± 5,8  t = 0,96   dans le bruit
    //     ouverte       cpl 0-2 +5,5 ± 11,9 t = 0,46   dans le bruit
    // Recommander un combiné sur t = 1,5 serait refaire l'erreur du badge
    // JOUABLE : un écart flatteur qu'aucun test ne soutient. À égalité
    // statistique on garde le simple gagnant — espérance mesurée avec la plus
    // petite erreur-type, un seul cheval à désigner, et pas de pari qui puisse
    // ne pas être proposé.
    const se = Math.sqrt((prof[meilleur + 'Se'] || 0) ** 2 + (prof.simpleSe || 0) ** 2);
    const ecart = 100 * (prof[meilleur] - prof.simple);
    const demontre = se > 0 && ecart / se > 1.96;
    const cle = demontre ? meilleur : 'simple';
    return { cle, pari: LIB[cle], rangs: RANGS[cle], ev: prof[cle] - 1,
             ecarte: demontre ? null : { instrument: LIB[meilleur], ecart, t: se ? ecart / se : 0 } };
  }

  return { pourCourse, probabilites, profilCourse, pariDuProfil, LIB, RANGS,
           LAMBDA, OVERROUND_MIN, OVERROUND_MAX };
})();
if (typeof module !== 'undefined') module.exports = PanneauParis;
if (typeof window !== 'undefined') window.PanneauParis = PanneauParis;
