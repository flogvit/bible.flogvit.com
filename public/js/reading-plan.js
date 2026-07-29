// Leseplan-tilstand, delt mellom `/leseplan`-siden (user.js) og forsidens
// plan-panel (home.js).
//
// Lagringsformatet er DATAKOMPATIBELT med den gamle appen — `activeReadingPlan`
// (plan-id) og `readingPlanProgress` (record per plan) er de samme nøklene
// sync.js allerede fletter (#10), så en bruker som synket fra den gamle appen
// finner planen sin igjen.
//
// Regnestykkene er rene funksjoner uten lagring, slik at de kan testes uten
// nettleser.

const ACTIVE_KEY = 'activeReadingPlan';
const PROGRESS_KEY = 'readingPlanProgress';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Kvote full eller skrivesperret (gratisbruker, plus.js) — tilstanden
    // lever videre i minnet for denne sidevisningen.
  }
}

export function activePlanId() {
  const id = read(ACTIVE_KEY, null);
  return typeof id === 'string' ? id : null;
}

export function allProgress() {
  const all = read(PROGRESS_KEY, {});
  return all && typeof all === 'object' ? all : {};
}

export function planProgress(planId) {
  return allProgress()[planId] ?? null;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sett planen aktiv og opprett framdriftsraden om den mangler.
 *
 * Raden er det som gir `startDate`, og uten den kan hverken «dag X av Y» eller
 * dagens lesning regnes ut. Den gamle appen skrev begge deler ved aktivering;
 * porten skrev bare plan-id-en, så panelet hadde ingenting å vise (#35).
 */
export function startPlan(planId, pacing = 'scheduled') {
  write(ACTIVE_KEY, planId);
  const all = allProgress();
  if (!all[planId]) {
    all[planId] = { planId, startDate: today(), completedDays: [], lastReadDate: null, pacing };
    write(PROGRESS_KEY, all);
  }
  return all[planId];
}

export function savePlanProgress(planId, progress) {
  const all = allProgress();
  all[planId] = progress;
  write(PROGRESS_KEY, all);
  return progress;
}

/** Hvilken dag i planen kalenderen står på. Dag 1 er startdatoen. */
export function currentDay(startDate, now = new Date()) {
  const start = new Date(`${startDate}T00:00:00`);
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  return Math.floor((day.getTime() - start.getTime()) / 86400000) + 1;
}

export function completionPercentage(progress, totalDays) {
  if (!totalDays) return 0;
  const done = new Set(progress?.completedDays ?? []).size;
  return Math.min(100, Math.round((done / totalDays) * 100));
}

/**
 * Dager på rad. Brutt hvis siste leste dag er mer enn ett døgn siden.
 *
 * Merk at dette IKKE er gamification i bibel-forstand: streaken finnes kun
 * inne i en leseplan brukeren selv har valgt, og CLAUDE.md gjør nettopp det
 * unntaket («vil man presses, velger man en leseplan»). Ingen varsler, ingen
 * påminnelser — tallet står der brukeren allerede er.
 */
export function streak(progress, now = new Date()) {
  if (!progress?.lastReadDate || !progress.startDate) return 0;
  const last = new Date(`${progress.lastReadDate}T00:00:00`);
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  last.setHours(0, 0, 0, 0);
  if (Math.floor((day.getTime() - last.getTime()) / 86400000) > 1) return 0;

  const done = new Set(progress.completedDays ?? []);
  let count = 0;
  for (let d = currentDay(progress.startDate, now); d >= 1; d--) {
    if (!done.has(d)) break;
    count++;
  }
  return count;
}

/**
 * Dagens lesning: første ikke-fullførte dag til og med i dag, ellers den neste
 * som gjenstår. `null` når hele planen er fullført.
 */
export function todaysReading(plan, progress) {
  if (!plan?.readings?.length || !progress) return null;
  const done = new Set(progress.completedDays ?? []);
  const find = (day) => plan.readings.find((r) => r.day === day) ?? null;

  if (progress.pacing === 'openended') {
    for (let d = 1; d <= plan.days; d++) if (!done.has(d)) return find(d);
    return null;
  }

  const day = Math.min(currentDay(progress.startDate), plan.days);
  for (let d = day; d >= 1; d--) if (!done.has(d)) return find(d);
  for (let d = day + 1; d <= plan.days; d++) if (!done.has(d)) return find(d);
  return null;
}
