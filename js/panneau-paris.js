/**
 * Panneau de décision : probabilité et espérance par type de pari.
 *
 *   const panneau = PanneauParis.pourCourse(participants);
 *   panneau.simple[0]      → { cheval, p, cote, ev }
 *   panneau.couple[0]      → { chevaux, p, divAttendu, ev }
 *   panneau.trio[0]        → { chevaux, p, divAttendu, ev }
 *
 * Tout est calibré sur 13 242 courses FR plat 2022-2025 (data/calibration_paris.json) :
 *
 *  - la probabilité part de la cote, p_i = (1/cote_i) / Σ(1/cote), puis reçoit la
 *    CORRECTION FAVORI/OUTSIDER mesurée sur 159 103 partants : un cheval à 1,3 %
 *    affiché n'en gagne que 0,9 % (ratio 0,68), un gros favori en gagne 9 % de plus
 *    qu'annoncé (ratio 1,09) ;
 *  - les combinaisons passent par le modèle de Harville, vérifié à ±0,01 près sur
 *    le couplé (132 420 paris) ;
 *  - le dividende attendu suit la courbe log(div) = a + b·log(1/p) ajustée par pari.
 *    b < 1 sur le couplé et le trio : les combinaisons rares y paient MOINS que
 *    leur juste prix.
 *
 * L'espérance affichée est négative partout — c'est le prélèvement de 16,5 %.
 * L'objet de ce panneau n'est pas de trouver un pari gagnant, c'est de montrer
 * lequel coûte le moins cher.
 */
const PanneauParis = (() => {
  // Correction favori/outsider — bornes de proba implicite → ratio observé/prédit
  const CORRECTION = [
    [0.000, 0.020, 0.683], [0.020, 0.040, 0.884], [0.040, 0.070, 0.968],
    [0.070, 0.110, 0.995], [0.110, 0.170, 1.023], [0.170, 0.250, 1.045],
    [0.250, 0.350, 1.047], [0.350, 1.000, 1.090],
  ];
  // Gain moyen RÉELLEMENT encaissé pour 1 € misé, par composition de rangs du
  // marché (0 = favori). Mesuré sur 13 242 courses FR plat 2022-2025, chaque
  // composition observée sur les 13 242.
  //
  // Pourquoi une table par composition et non une formule en fonction de la
  // probabilité : à probabilité égale, un trio de trois favoris paie nettement
  // moins qu'un trio contenant un outsider, le pari mutuel concentrant l'argent
  // sur les favoris. Une courbe en p seule surestimait le trio de 10 points.
  const GAIN = {
    simple: {'0':0.8644,'1':0.8687,'2':0.8629,'3':0.816,'4':0.8024,'5':0.841},
    couple: {'0-1':0.8769,'0-2':0.8099,'0-3':0.7962,'0-4':0.7928,'1-2':0.8783,'1-3':0.8096,'1-4':0.7422,'2-3':0.736,'2-4':0.8043,'3-4':0.7428},
    trio:   {'0-1-2':0.6664,'0-1-3':0.6985,'0-1-4':0.7273,'0-2-3':0.7445,'0-2-4':0.7549,'0-3-4':0.7136,'1-2-3':0.7483,'1-2-4':0.8121,'1-3-4':0.733,'2-3-4':0.5365},
  };
  const gainEspere = (rangs, k) => GAIN[k][rangs.join('-')];

  const ratio = (p) => (CORRECTION.find(([lo, hi]) => p >= lo && p < hi) || [0, 0, 1])[2];

  /** Probabilités corrigées, renormalisées pour sommer à 1. */
  function probabilites(parts) {
    const cotes = parts.map((p) => parseFloat(p.cote) || 0).map((c) => (c > 1 ? c : null));
    const inv = cotes.reduce((s, c) => s + (c ? 1 / c : 0), 0);
    if (!inv) return parts.map(() => 0);
    const brut = cotes.map((c) => (c ? (1 / c) / inv : 0));
    const corr = brut.map((p) => p * ratio(p));
    const som = corr.reduce((a, b) => a + b, 0);
    return corr.map((p) => p / som);
  }

  // Harville : le 2e est tiré parmi les restants au prorata des probabilités
  const pCouple = (a, b) => (a * b) / (1 - a) + (b * a) / (1 - b);
  function pTrio(v) {
    const [x, y, z] = v; let s = 0;
    for (const [a, b, c] of [[x,y,z],[x,z,y],[y,x,z],[y,z,x],[z,x,y],[z,y,x]])
      s += a * (b / (1 - a)) * (c / (1 - a - b));
    return s;
  }

  function pourCourse(participants, { profondeur = 5 } = {}) {
    const parts = participants
      .filter((p) => (parseFloat(p.cote) || 0) > 1)
      .sort((a, b) => parseFloat(a.cote) - parseFloat(b.cote));
    if (parts.length < 4) return null;
    const P = probabilites(parts);
    const nom = (p) => p.cheval || p.nom || `#${p['n°'] || p.numero || ''}`;
    const k = Math.min(profondeur, parts.length);

    const simple = parts.slice(0, k).map((p, i) => {
      const cote = parseFloat(p.cote);
      const g = gainEspere([i], 'simple');
      return { chevaux: [nom(p)], rangs: [i], p: P[i], cote,
               ev: g === undefined ? null : g - 1 };
    });
    const couple = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const p = pCouple(P[i], P[j]); const g = gainEspere([i, j], 'couple');
      couple.push({ chevaux: [nom(parts[i]), nom(parts[j])], rangs: [i, j], p,
                    divAttendu: g === undefined ? null : g / p,
                    ev: g === undefined ? null : g - 1 });
    }
    const trio = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) for (let l = j + 1; l < k; l++) {
      const p = pTrio([P[i], P[j], P[l]]); const g = gainEspere([i, j, l], 'trio');
      trio.push({ chevaux: [nom(parts[i]), nom(parts[j]), nom(parts[l])], rangs: [i, j, l], p,
                  divAttendu: g === undefined ? null : g / p,
                  ev: g === undefined ? null : g - 1 });
    }
    const tri = (arr) => arr.filter((x) => x.ev !== null).sort((a, b) => b.ev - a.ev);
    return { simple: tri(simple), couple: tri(couple), trio: tri(trio),
             prelevement: 0.165 };
  }

  return { pourCourse, probabilites };
})();
if (typeof module !== 'undefined') module.exports = PanneauParis;
if (typeof window !== 'undefined') window.PanneauParis = PanneauParis;
