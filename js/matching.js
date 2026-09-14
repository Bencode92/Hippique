/* Rattachement des noms de la fiche PMU aux classements France Galop.
 *
 * UNE SEULE implémentation, partagée par le navigateur (index.html via
 * window.Matching), le scoring node (live-scoring.js) et les bancs d'essai
 * (bench/*.mjs). Avant ce module il y en avait trois, qui ne se ressemblaient
 * pas : l'écran retrouvait Boudot, l'apprentissage non.
 *
 * Principe : déterministe, pas de distance d'édition. On PARSE les deux côtés
 * (initiales / prénoms / nom de famille / drapeau (S)), on indexe le classement
 * par nom de famille, et on ne rattache que si les initiales sont compatibles.
 * Chaque rattachement porte sa méthode et sa confiance, pour être audité.
 *
 *   PMU            « PC.BOUDOT »          → initiales PC, famille BOUDOT
 *   France Galop   « PIERRE-CHARLES BOUDOT » → prénoms PIERRE CHARLES, famille BOUDOT
 *   PMU            « FH.GRAFFARD (S) »    → initiales FH, famille GRAFFARD, (S)
 *   France Galop   « FH. GRAFFARD (S) »   → idem, compact FHGRAFFARD → exact
 *
 * Méthodes, par confiance décroissante :
 *   manuel     table data/claude_correspondances.json
 *   exact      même chaîne compacte (sans ponctuation ni civilité)
 *   noyau      idem sans les formes juridiques (SCEA, S.A.R.L., SUCC…)
 *   initiales  même famille + initiales compatibles avec les prénoms, 1 seul candidat
 *   tronque    nom coupé à 25 caractères par le PMU, un seul nom du classement commence ainsi
 *   ambigu     plusieurs candidats compatibles → le plus actif, à vérifier
 *   famille    même famille, initiales NON compatibles — REFUSÉ, listé pour audit seulement
 *   null       rien
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Matching = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CIVILITES = new Set(['MME', 'MLLE', 'MR', 'MRS', 'MISS', 'MADAME', 'MONSIEUR', 'SUC']);
  const PAYS = new Set(['GB', 'IRE', 'USA', 'GER', 'ITY', 'SPA', 'JPN', 'AUS', 'NZ', 'ARG', 'BRZ', 'CHI', 'SAF', 'CAN', 'FR', 'BEL', 'SWE', 'NOR', 'DEN', 'POL', 'CZE', 'SLO', 'HUN', 'TUR', 'UAE', 'QA', 'KSA', 'HK', 'SIN', 'IND', 'URU', 'PER']);
  const CONF = { manuel: 100, exact: 100, noyau: 95, initiales: 95, tronque: 90, ambigu: 60, famille: 40 };
  // Particules : la fiche PMU les met APRÈS (« A.MIEULLE DE », « E.ANDIGNE D' »),
  // le classement AVANT (« A. DE MIEULLE »). On les ramène devant des deux côtés.
  const PARTICULES = new Set(['DE', 'D', 'DU', 'DES', 'LE', 'LA', 'VAN', 'VON', 'DER', 'DEN', 'DI', 'DA', 'DEL', 'DELLA', 'MAC', 'MC', 'O']);
  // Formes juridiques : ignorées dans la clé « noyau » des éleveurs et propriétaires
  // (« SCEA ECURIE HARAS DU CADRAN » = « ECURIE HARAS DU CADRAN »).
  const FORMES = new Set(['SA', 'SAS', 'SASU', 'SARL', 'EARL', 'SCEA', 'SCA', 'SC', 'SCI', 'SNC', 'GAEC', 'GFA', 'EURL', 'STE', 'SOCIETE', 'LTD', 'LIMITED', 'INC', 'LLC', 'GMBH', 'BV', 'NV', 'AG', 'CIE', 'CO', 'COMPANY', 'SUC', 'SUCC', 'SUCCESSION', 'ENTR', 'ENTRAINEMENT', 'ET', 'AND', 'THE']);

  function canon(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/\s+/g, ' ').trim();
  }
  function tokens(s) {
    return canon(s).split(/[^A-Z0-9]+/).filter(Boolean);
  }
  function compact(s) { return tokens(s).join(''); }
  function premieresLettres(mots) { return mots.map(m => m[0]).join(''); }

  // ── personnes (jockey, entraîneur, éleveur, propriétaire) ────────────────
  function parsePersonne(brut) {
    let s = canon(brut);
    const drapeaux = [];
    s = s.replace(/\(([A-Z.]+)\)/g, (_, d) => { drapeaux.push(d.replace(/\./g, '')); return ' '; });
    s = s.replace(/\.\.\.+/g, ' ').replace(/\s+/g, ' ').trim();
    // sigles pointés : « S.A.R.L. », « S.C.E.A. » → SARL, SCEA (mais « D.D.MELE » garde ses initiales)
    s = s.replace(/(?:^|\s)((?:[A-Z]\.){2,})(?=\s|[A-Z]|$)/g, (m, sig) => {
      const plat = sig.replace(/\./g, '');
      if (!FORMES.has(plat)) return m;          // « D.D.MELE » : de vraies initiales, on ne touche pas
      return (m[0] === ' ' ? ' ' : '') + plat + ' ';
    }).replace(/\s+/g, ' ').trim();
    // « EC. » / « EC » en tête = ECURIE (propriétaires)
    s = s.replace(/^EC(?:\.\s*|\s+)(?=[A-Z])/, 'ECURIE ');
    // « STE ENTR. X », « STE D'ENTR. X » = société d'entraînement = le « (S) » du classement
    if (/^STE\s+(D')?ENTR/.test(s)) { s = s.replace(/^STE\s+(D')?ENTR(AINEMENT)?\.?\s*/, ''); drapeaux.push('S'); }
    let civ = null;
    // civilités et titres en tête, éventuellement enchaînés : « SUCC CTESSE BERTRAND DE TARRAGON »
    for (let m; (m = s.match(/^(SUCC?|SUCCESSION|MME|MLLE|MRS|MR|MISS|MADAME|MONSIEUR|CTESSE|COMTESSE|CTE|COMTE|BARON|BARONNE|BNE|LORD|LADY|SIR|DR|PCSSE|PRINCESSE|PRINCE|DUC|DUCHESSE|MARQUIS|MARQUISE|SHEIKH|SHEIKHA|HH|HRH)\.?\s+(.+)$/));) {
      const t = m[1];
      if (!civ) civ = /^SUCC?/.test(t) ? 'SUC' : (t === 'MME' || t === 'MLLE' || t === 'MRS' || t === 'MISS' || t === 'MADAME' || t === 'CTESSE' || t === 'COMTESSE' || t === 'BARONNE' || t === 'BNE' || t === 'LADY' || t === 'PCSSE' || t === 'PRINCESSE' || t === 'DUCHESSE' || t === 'MARQUISE' || t === 'SHEIKHA') ? 'MME' : 'MR';
      s = m[2];
    }
    // initiales explicites : « PC.BOUDOT », « N.M..LOPES DUARTE », « JPH .DUBOIS », « A&L.FABRE »
    let initiales = null, prenoms = [], famille;
    const mIni = s.match(/^((?:[A-Z]{1,4}(?:&[A-Z]{1,4})*\s*\.+\s*)+)(.+)$/);
    if (mIni && tokens(mIni[2]).length) {
      initiales = mIni[1].replace(/[^A-Z]/g, '');
      famille = tokens(mIni[2]);
      // « S.C.E.A. HARAS DU HOGUENET » : ce sont des points de sigle, pas des initiales
      if (FORMES.has(initiales)) { famille.unshift(initiales); initiales = null; }
    } else {
      famille = tokens(s);
    }
    // particule en fin (fiche PMU) → devant
    while (famille.length > 1 && PARTICULES.has(famille[famille.length - 1])) famille.unshift(famille.pop());
    // noyau : sans formes juridiques ni particules — « S.C.E.A. DE LA BARBOTTIERE » = « SCEA BARBOTTIERE »
    const noyau = famille.filter(t => !FORMES.has(t) && !PARTICULES.has(t) && t !== 'L').join('');
    return {
      brut: String(brut == null ? '' : brut), civ, initiales, prenoms, famille,
      drapeaux, compact: (initiales || '') + famille.join(''), noyau: (initiales || '') + noyau,
      organisation: !initiales && !civ && !drapeaux.includes('S'),   // « STE ENTR. MATHIEU BOUTIN » est une personne (S)
    };
  }

  // Les prénoms d'un nom complet du classement sont-ils compatibles avec les
  // initiales lues sur la fiche ?  « PC » ~ PIERRE CHARLES, « THO » ~ THOMAS,
  // « CH » ~ CHRISTOPHE ou CHARLES HENRI, « M » ~ MAXIME.
  function compatibles(initiales, prenoms, initialesCandidat) {
    if (!initiales) return true;
    if (initialesCandidat) {
      return initialesCandidat === initiales
        || initialesCandidat.startsWith(initiales) || initiales.startsWith(initialesCandidat);
    }
    if (!prenoms.length) return false;
    const pl = premieresLettres(prenoms);
    if (pl === initiales) return true;
    if (pl.startsWith(initiales)) return true;                  // « P » ~ PIERRE CHARLES
    if (prenoms[0].startsWith(initiales)) return true;          // « THO » ~ THOMAS
    if (prenoms.length >= 2 && (prenoms[0][0] + prenoms[1]).startsWith(initiales)) return true; // « JPH » ~ JEAN PHILIPPE
    return false;
  }

  // ── chevaux ──────────────────────────────────────────────────────────────
  function parseCheval(brut) {
    let s = canon(brut);
    let sexe = null, race = null, age = null, pays = null;
    const mSuf = s.match(/^(.*?)\s+([HFM])\.\s*([A-Z]+)\.?\s*(\d+)\s*A\.?\s*$/);
    if (mSuf) { s = mSuf[1]; sexe = mSuf[2]; race = mSuf[3]; age = parseInt(mSuf[4], 10); }
    const mPays = s.match(/^(.*?)\s*\(([A-Z]{2,3})\)\s*$/);
    if (mPays) { s = mPays[1]; pays = mPays[2]; }
    else {
      const t = s.split(' ');
      if (t.length >= 2 && PAYS.has(t[t.length - 1]) && t[t.length - 1].length === 3) { pays = t.pop(); s = t.join(' '); }
    }
    return { brut: String(brut == null ? '' : brut), nom: s.trim(), compact: compact(s), sexe, race, age, pays };
  }

  // ── index d'un classement ────────────────────────────────────────────────
  // rows : lignes du classement (CSV parsé ou data/<cat>.json), champ Nom ou Cheval.
  function creerIndex(rows, categorie, options) {
    options = options || {};
    const idx = { categorie, n: 0, parCompact: new Map(), parNoyau: new Map(), parFamille: new Map(), parNom: new Map(), manuel: new Map(), etrangers: new Set() };
    const ajoute = (map, cle, e) => { const l = map.get(cle); if (l) l.push(e); else map.set(cle, [e]); };
    for (const row of rows || []) {
      const nom = row.Nom != null ? row.Nom : (row.Cheval != null ? row.Cheval : row.LibelleCheval);
      if (!nom) continue;
      idx.n++;
      idx.parNom.set(canon(nom), row);
      if (categorie === 'chevaux') {
        const p = parseCheval(nom);
        ajoute(idx.parCompact, p.compact, { row, p });
        continue;
      }
      const p = parsePersonne(nom);
      p.partants = +(row.Partants || row.Courses || 0) || 0;
      ajoute(idx.parCompact, p.compact, { row, p });
      if (p.noyau && p.noyau !== p.compact) ajoute(idx.parNoyau, p.noyau, { row, p });
      if (p.initiales) {
        ajoute(idx.parFamille, p.famille.join(' '), { row, p, prenoms: [], initiales: p.initiales });
      } else {
        // nom complet : chaque découpe prénoms | famille est indexée
        const t = p.famille;
        for (let k = 1; k < t.length; k++) {
          ajoute(idx.parFamille, t.slice(k).join(' '), { row, p, prenoms: t.slice(0, k), initiales: null });
        }
        if (t.length === 1) ajoute(idx.parFamille, t[0], { row, p, prenoms: [], initiales: null });
      }
    }
    if (options.correspondances) {
      for (const [brut, info] of Object.entries(options.correspondances)) {
        const cible = info && (info.match || info);
        if (typeof cible === 'string' && (!info.categorie || info.categorie === categorie)) idx.manuel.set(canon(brut), canon(cible));
      }
    }
    for (const e of options.etrangers || []) idx.etrangers.add(canon(e));
    return idx;
  }

  function resultat(entree, methode, candidats) {
    const row = entree.row;
    return { item: row, nom: canon(row.Nom != null ? row.Nom : (row.Cheval != null ? row.Cheval : row.LibelleCheval)), methode, confiance: CONF[methode], candidats: candidats || null };
  }

  function rattacherPersonne(idx, brut, options) {
    options = options || {};
    const cle = canon(brut);
    if (!cle) return null;
    const man = idx.manuel.get(cle);
    if (man && idx.parNom.has(man)) return resultat({ row: idx.parNom.get(man) }, 'manuel');
    const p = parsePersonne(brut);
    if (!p.famille.length) return null;
    const ex = idx.parCompact.get(p.compact);
    if (ex && ex.length) {
      // drapeau (S) départage deux homonymes, sinon le plus actif
      const meme = ex.filter(e => e.p.drapeaux.join() === p.drapeaux.join());
      const pool = meme.length ? meme : ex;
      pool.sort((a, b) => b.p.partants - a.p.partants);
      return resultat(pool[0], 'exact', pool.length > 1 ? pool.map(e => e.p.brut) : null);
    }
    // même nom sans les formes juridiques (éleveurs, propriétaires, écuries)
    const noy = p.noyau && (idx.parNoyau.get(p.noyau) || []).concat(idx.parCompact.get(p.noyau) || []);
    if (noy && noy.length) {
      noy.sort((a, b) => b.p.partants - a.p.partants);
      return resultat(noy[0], 'noyau', noy.length > 1 ? noy.map(e => e.p.brut) : null);
    }
    // La fiche PMU tronque à 25 caractères : « ECURIE DU HARAS DE LA BOR ». Un seul
    // nom du classement commençant ainsi → c'est lui.
    if (cle.length >= 25 && p.compact.length >= 12) {
      const pref = [];
      for (const [k, l] of idx.parCompact) if (k.startsWith(p.compact)) pref.push(...l);
      const uniq = pref.filter((c, i) => pref.findIndex(d => d.row === c.row) === i);
      if (uniq.length === 1) return resultat(uniq[0], 'tronque');
    }
    // une organisation (ni initiales ni civilité) ne se découpe pas en prénom + famille :
    // « NEWSELLS PARK STUD » n'est pas « MIDDLE PARK STUD »
    if (p.organisation && (idx.categorie === 'eleveurs' || idx.categorie === 'proprietaires')) return null;
    // recherche par famille — avec initiales explicites, ou nom complet découpé
    const essais = [];
    if (p.initiales) essais.push({ ini: p.initiales, fam: p.famille });
    else {
      const t = p.famille.filter(x => !FORMES.has(x));   // « MATHIEU BOUTIN SARL » → MATHIEU | BOUTIN
      for (let k = 1; k < t.length; k++) essais.push({ ini: premieresLettres(t.slice(0, k)), fam: t.slice(k), prenoms: t.slice(0, k) });
      essais.push({ ini: null, fam: t });   // « MONTAUBAN VAN SWIJNDREGT » → « A. MONTAUBAN VAN SWIJNDREGT (S) »
    }
    for (const e of essais) {
      const cands = idx.parFamille.get(e.fam.join(' '));
      if (!cands || !cands.length) continue;
      let ok = cands.filter(c => e.prenoms && c.prenoms.length
        ? c.prenoms.join(' ') === e.prenoms.join(' ') || compatibles(e.ini, c.prenoms, c.initiales)
        : compatibles(e.ini, c.prenoms, c.initiales));
      // dédoublonne (une ligne peut être indexée sous plusieurs découpes)
      ok = ok.filter((c, i) => ok.findIndex(d => d.row === c.row) === i);
      // le drapeau (S) départage : « A&L.FABRE (S) » → « A. FABRE (S) », pas « MME A. FABRE »
      if (ok.length > 1 && p.drapeaux.length) { const md = ok.filter(c => c.p.drapeaux.join() === p.drapeaux.join()); if (md.length) ok = md; }
      // la civilité aussi : « MME A.FOUASSIER » → MME AGATHE FOUASSIER, pas MR ADRIEN
      if (ok.length > 1 && p.civ) { const genre = c => c.p.civ === 'MME' || c.p.civ === 'MLLE' || c.p.civ === 'MRS' || c.p.civ === 'MISS' ? 'F' : c.p.civ ? 'M' : null; const g = genre({ p }); const mc = ok.filter(c => genre(c) === g); if (mc.length) ok = mc; }
      if (ok.length === 1) return resultat(ok[0], 'initiales');
      if (ok.length > 1) {
        const exacts = ok.filter(c => c.initiales ? c.initiales === e.ini : premieresLettres(c.prenoms) === e.ini);
        const pool = (exacts.length === 1 ? exacts : (exacts.length ? exacts : ok)).slice().sort((a, b) => b.p.partants - a.p.partants);
        return resultat(pool[0], exacts.length === 1 ? 'initiales' : 'ambigu', pool.map(c => c.p.brut));
      }
      // même famille mais initiales incompatibles : « E.DUBOURG » n'est pas KILIAN DUBOURG.
      // Rendu seulement sur demande (audit), jamais utilisé pour scorer.
      const uniq = cands.filter((c, i) => cands.findIndex(d => d.row === c.row) === i);
      if (uniq.length === 1 && e.ini && options.douteux) return resultat(uniq[0], 'famille', [uniq[0].p.brut]);
    }
    return null;
  }

  function rattacherCheval(idx, brut) {
    const p = parseCheval(brut);
    if (!p.compact) return null;
    const cands = idx.parCompact.get(p.compact);
    if (!cands || !cands.length) return null;
    if (cands.length === 1) return resultat(cands[0], 'exact');
    // homonymes : l'âge départage
    const age = c => +(c.row['Âge'] != null ? c.row['Âge'] : (c.row.Age != null ? c.row.Age : NaN));
    const memeAge = p.age != null ? cands.filter(c => age(c) === p.age) : [];
    if (memeAge.length === 1) return resultat(memeAge[0], 'exact');
    return resultat(cands[0], 'ambigu', cands.map(c => c.p.brut + (isNaN(age(c)) ? '' : ' (' + age(c) + ' ans)')));
  }

  // Éleveurs et propriétaires peuvent être plusieurs : « G.THEPOT/M.BEDIER ».
  // On ne coupe PAS sur « & » (« WERTHEIMER & FRERE » est une seule entité).
  function rattacherMultiple(idx, brut, options) {
    const parts = canon(brut).split(/\s*[\/,]\s*/).filter(Boolean);
    const res = parts.map(pt => rattacherPersonne(idx, pt, options)).filter(Boolean);
    if (!res.length) return null;
    const r = res[0];
    if (res.length > 1) r.tous = res;
    return r;
  }

  // options.douteux : rendre aussi les rattachements « famille seule » (audit uniquement)
  function rattacher(idx, brut, categorie, options) {
    const cat = categorie || (idx && idx.categorie);
    if (!idx || !brut) return null;
    if (cat === 'chevaux') return rattacherCheval(idx, brut);
    if (cat === 'eleveurs' || cat === 'proprietaires') return rattacherMultiple(idx, brut, options);
    return rattacherPersonne(idx, brut, options);
  }

  // Bilan d'une course : combien de partants sont rattachés, et lesquels manquent.
  // indexes : { jockeys, entraineurs, chevaux, eleveurs?, proprietaires? }
  function bilanCourse(indexes, participants) {
    const champs = { jockeys: 'jockey', entraineurs: 'entraineur', chevaux: 'cheval', eleveurs: 'éleveurs', proprietaires: 'propriétaire' };
    const b = { partants: participants.length, categories: {}, manquants: [] };
    for (const [cat, champ] of Object.entries(champs)) {
      if (!indexes[cat]) continue;
      let ok = 0, douteux = 0;
      for (const p of participants) {
        const r = rattacher(indexes[cat], p[champ], cat);
        if (r) { ok++; if (r.confiance < 95) douteux++; }
        else b.manquants.push({ categorie: cat, numero: p['n°'] || p.numero, nom: p[champ] });
      }
      b.categories[cat] = { ok, douteux, total: participants.length };
    }
    return b;
  }

  return { canon, tokens, compact, parsePersonne, parseCheval, compatibles, creerIndex, rattacher, bilanCourse, CONF };
});
