#!/usr/bin/env node
/**
 * Bench du chemin critique du front (index.html + js/ranking-loader.js).
 *
 *   node bench/bench-front.mjs
 *
 * Mesure, pour chaque fichier chargé par loadAllData() : octets sur le fil
 * (gzip), octets bruts, temps de parse JSON. Puis rejoue deux scénarios en
 * Promise.all — comme le fait le navigateur — et compare le mur.
 *
 * AVANT  = loadAllData() actuel (12 chargeurs)
 * APRES  = loadCoreData() seul (ce dont le classement Leviers a besoin)
 */

const GH = 'https://bencode92.github.io/Hippique/data/';
const RAW = 'https://raw.githubusercontent.com/Bencode92/Hippique/main/data/';

// Chaque entrée reflète l'hôte réellement utilisé par le chargeur d'origine.
const FICHIERS = [
  // loadCategoryData() → GitHub Pages, chemin relatif
  { f: 'chevaux_ponderated_latest.json',      h: GH,  core: true,  via: 'loadCategoryData' },
  { f: 'jockeys_ponderated_latest.json',      h: GH,  core: true,  via: 'loadCategoryData' },
  { f: 'cravache_or_ponderated_latest.json',  h: GH,  core: true,  via: 'loadCategoryData' },
  { f: 'entraineurs_ponderated_latest.json',  h: GH,  core: false, via: 'loadCategoryData' },
  { f: 'eleveurs_ponderated_latest.json',     h: GH,  core: false, via: 'loadCategoryData' },
  { f: 'proprietaires_ponderated_latest.json',h: GH,  core: false, via: 'loadCategoryData' },
  // loadHistoricalData() → raw.githubusercontent
  { f: 'chevaux_2025_ponderated_latest.json',     h: RAW, core: true,  via: 'loadHistoricalData' },
  { f: 'jockeys_2025_ponderated_latest.json',     h: RAW, core: true,  via: 'loadHistoricalData' },
  { f: 'cravache_or_2025_ponderated_latest.json', h: RAW, core: true,  via: 'loadHistoricalData' },
  { f: 'entraineurs_2025_ponderated_latest.json', h: RAW, core: false, via: 'loadHistoricalData' },
  { f: 'eleveurs_2025_ponderated_latest.json',    h: RAW, core: false, via: 'loadHistoricalData' },
  { f: 'proprietaires_2025_ponderated_latest.json',h: RAW,core: false, via: 'loadHistoricalData' },
  // loadDistanceStats() → couche distance du Classement Modèle (ligne 2551)
  { f: 'chevaux_distance_stats.json',     h: RAW, core: false, via: 'loadDistanceStats' },
  { f: 'jockeys_distance_stats.json',     h: RAW, core: false, via: 'loadDistanceStats' },
  { f: 'entraineurs_distance_stats.json', h: RAW, core: false, via: 'loadDistanceStats' },
  // loadFormeRecente() → Classement Modèle uniquement (Leviers code 50 en dur)
  { f: 'chevaux_forme_recente.json',     h: RAW, core: false, via: 'loadFormeRecente' },
  { f: 'jockeys_forme_recente.json',     h: RAW, core: false, via: 'loadFormeRecente' },
  { f: 'entraineurs_forme_recente.json', h: RAW, core: false, via: 'loadFormeRecente' },
  // divers
  { f: 'claude_correspondances.json',   h: RAW, core: true,  via: 'loadClaudeCorrespondances' },
  { f: 'combo_jockey_entraineur.json',  h: RAW, core: false, via: 'loadComboStats' },
  { f: 'stable_form.json',              h: RAW, core: false, via: 'loadStableFormAndIntervalle' },
  { f: 'intervalle_courses.json',       h: RAW, core: false, via: 'loadStableFormAndIntervalle' },
];

const mo = o => (o / 1048576).toFixed(2).padStart(7);
const ms = n => Math.round(n).toLocaleString('fr-FR').padStart(6);

async function charger(e) {
  const t0 = performance.now();
  const r = await fetch(e.h + e.f, { headers: { 'Accept-Encoding': 'gzip' } });
  const txt = await r.text();
  const tReseau = performance.now() - t0;
  const wire = parseInt(r.headers.get('content-length') || '0') || 0;
  const t1 = performance.now();
  JSON.parse(txt);
  const tParse = performance.now() - t1;
  return { ...e, ok: r.ok, wire, brut: Buffer.byteLength(txt), tReseau, tParse };
}

async function scenario(nom, liste) {
  const t0 = performance.now();
  const res = await Promise.all(liste.map(charger));   // comme le Promise.all de loadAllData()
  const mur = performance.now() - t0;
  const tot = res.reduce((a, r) => ({
    wire: a.wire + r.wire, brut: a.brut + r.brut, parse: a.parse + r.tParse,
  }), { wire: 0, brut: 0, parse: 0 });
  return { nom, n: liste.length, mur, ...tot, res };
}

const run = async () => {
  console.log('\n🏇 BENCH CHEMIN CRITIQUE — ' + new Date().toISOString().slice(0, 16).replace('T', ' '));
  console.log('='.repeat(78));

  // Détail par fichier (une mesure, réutilisée dans les deux agrégats)
  const detail = await Promise.all(FICHIERS.map(charger));
  console.log('\nDÉTAIL PAR FICHIER');
  console.log('  ' + 'brut'.padStart(7) + '  ' + 'gzip'.padStart(7) + '  ' + 'parse'.padStart(6) + '  rôle       fichier');
  console.log('  ' + '-'.repeat(74));
  for (const r of [...detail].sort((a, b) => b.brut - a.brut)) {
    const role = r.core ? 'NOYAU  ' : 'modèle ';
    console.log(`  ${mo(r.brut)}  ${mo(r.wire)}  ${ms(r.tParse)}  ${role}   ${r.f}${r.ok ? '' : '  ⚠️ ' + r.ok}`);
  }

  const avant = await scenario('AVANT  — loadAllData() (bloquait le score)', FICHIERS);
  const apres = await scenario('APRÈS  — loadCoreData() (chemin critique)', FICHIERS.filter(e => e.core));
  const total = await scenario('APRÈS  — core + extra (extra en tâche de fond)', FICHIERS);

  console.log('\nSCÉNARIOS (Promise.all, comme le navigateur)');
  console.log('  ' + 'requêtes'.padStart(8) + '  ' + 'brut'.padStart(7) + '  ' + 'gzip'.padStart(7) + '  ' + 'parse'.padStart(6) + '  ' + 'mur'.padStart(6) + '  scénario');
  console.log('  ' + '-'.repeat(74));
  for (const s of [avant, apres, total]) {
    console.log(`  ${String(s.n).padStart(8)}  ${mo(s.brut)}  ${mo(s.wire)}  ${ms(s.parse)}  ${ms(s.mur)}  ${s.nom}`);
  }
  const pc = (a, b) => `${b <= a ? '−' : '+'}${Math.round(Math.abs(1 - b / a) * 100)}%`;
  console.log('  ' + '-'.repeat(74));
  console.log(`  ${'gain'.padStart(8)}  ${pc(avant.brut, apres.brut).padStart(7)}  ${pc(avant.wire, apres.wire).padStart(7)}  ${pc(avant.parse, apres.parse).padStart(6)}  ${pc(avant.mur, apres.mur).padStart(6)}   sur le chemin critique`);
  console.log(`  ${'gain'.padStart(8)}  ${pc(avant.brut, total.brut).padStart(7)}  ${pc(avant.wire, total.wire).padStart(7)}  ${pc(avant.parse, total.parse).padStart(6)}  ${pc(avant.mur, total.mur).padStart(6)}   sur le total (inchangé : rien n'est supprimé)`);
  console.log('\n  Unités : Mo / Mo / ms / ms. Le mur dépend du réseau — relancer 2-3 fois.\n');
};

run().catch(e => { console.error(e); process.exit(1); });
