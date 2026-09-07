#!/usr/bin/env node
/**
 * Bench du coût d'affichage d'un jour — CPU isolé du réseau.
 *
 *   node bench/bench-jour.mjs 2026-09-03
 *
 * Rejoue le VRAI code du front (js/ranking-loader.js) sous le même shim que
 * live-scoring.js, avec les fichiers lus sur le disque : le réseau est donc à
 * zéro et ce qui reste est exactement le calcul que le navigateur fait.
 *
 * Sépare trois postes :
 *   1. chargement + parse des classements  (loadCoreData / loadExtraData)
 *   2. classement MODÈLE   (calculerScoresCourse) — par course
 *   3. classement LEVIERS  (computeOptimalRanks)  — par course
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const DATE = process.argv[2] || '2026-09-03';

// ── shim navigateur (même principe que live-scoring.js) ────────────────
global.window = { location: { hostname: 'localhost' }, rankingLoader: undefined };
global.document = { addEventListener: () => {} };
const vraiLog = console.log.bind(console);
global.console = { ...console, log: () => {}, warn: () => {} };
let nFetch = 0, octets = 0;
global.fetch = async (url) => {
  nFetch++;
  const u = String(url).split('?')[0];
  const m = u.match(/(?:raw\.githubusercontent\.com\/Bencode92\/Hippique\/main\/|^\/Hippique\/|^\/|^)(data\/.+)$/);
  const p = m ? path.join(RACINE, m[1]) : null;
  if (!p) return { ok: false, status: 404 };
  try {
    const c = fs.readFileSync(p, 'utf8');
    octets += c.length;
    return { ok: true, json: async () => JSON.parse(c), text: async () => c };
  } catch { return { ok: false, status: 404 }; }
};

let code = fs.readFileSync(path.join(RACINE, 'js/ranking-loader.js'), 'utf8');
code = code.replace('const rankingLoader = {', 'global.rankingLoader = {');
code = code.replace('window.rankingLoader = rankingLoader;', '');
eval(code);
const rl = global.rankingLoader;

const ms = (n) => Math.round(n).toLocaleString('fr-FR').padStart(7);

// ── 1. classements ─────────────────────────────────────────────────────
const t0 = performance.now();
if (rl.loadCoreData) await rl.loadCoreData();
const tCore = performance.now() - t0;
const oCore = octets, fCore = nFetch;
const t1 = performance.now();
await rl.loadAllData();
const tTout = performance.now() - t1;

// ── 2. courses du jour ─────────────────────────────────────────────────
const fichiers = fs.readdirSync(path.join(RACINE, 'data/courses'))
  .filter((f) => f.startsWith(DATE) && f.endsWith('.json'));
const courses = [];
for (const f of fichiers) {
  const d = JSON.parse(fs.readFileSync(path.join(RACINE, 'data/courses', f), 'utf8'));
  if (d.type_reunion && d.type_reunion.toLowerCase() !== 'plat') continue;
  for (const c of d.courses || []) {
    if (c.type && c.type.toLowerCase() !== 'plat') continue;
    if (!c.participants?.length) continue;
    courses.push({ hippo: d.hippodrome, c });
  }
}
const partants = courses.reduce((a, x) => a + x.c.participants.length, 0);

let tModele = 0, tLeviers = 0;
for (const { c } of courses) {
  const a = performance.now();
  await rl.calculerScoresCourse(c);
  tModele += performance.now() - a;
  const b = performance.now();
  try { await rl.computeOptimalRanks(c); } catch {}
  tLeviers += performance.now() - b;
}

vraiLog(`\n📅 BENCH JOUR — ${DATE}`);
vraiLog('='.repeat(64));
vraiLog(`  ${courses.length} courses plat, ${partants} partants, ${fichiers.length} fichiers\n`);
vraiLog(`  ${ms(tCore)} ms   classements NOYAU        (${fCore} fichiers, ${(oCore / 1048576).toFixed(1)} Mo)`);
vraiLog(`  ${ms(tTout)} ms   classements RESTE        (${nFetch - fCore} fichiers, ${((octets - oCore) / 1048576).toFixed(1)} Mo)`);
vraiLog(`  ${ms(tModele)} ms   classement MODÈLE        (${(tModele / courses.length).toFixed(0)} ms/course)`);
vraiLog(`  ${ms(tLeviers)} ms   classement LEVIERS       (${(tLeviers / courses.length).toFixed(0)} ms/course)`);
vraiLog('  ' + '-'.repeat(60));
vraiLog(`  ${ms(tCore + tTout + tModele + tLeviers)} ms   TOTAL CPU (réseau exclu — lecture disque)\n`);
