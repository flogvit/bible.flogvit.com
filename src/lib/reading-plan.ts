/**
 * Reading plan types and storage handling
 *
 * Uses IndexedDB via userData for persistence with localStorage fallback.
 */

import {
  getActivePlanId as getActivePlanIdFromStorage,
  setActivePlanId as setActivePlanIdInStorage,
  getAllPlanProgress,
  saveSinglePlanProgress,
  savePlanProgress,
  ReadingPlanProgress,
} from './offline/userData';

// Re-export types
export type { ReadingPlanProgress };

export interface ReadingChapter {
  bookId: number;
  chapter: number;
}

export interface DayReading {
  day: number;
  chapters: ReadingChapter[];
}

export interface ReadingPlanSummary {
  id: string;
  name: string;
  description: string;
  category: 'kort' | 'middels' | 'lang';
  days: number;
}

export interface ReadingPlan extends ReadingPlanSummary {
  readings: DayReading[];
}

// ============================================
// Async API (uses IndexedDB)
// ============================================

// Get the active reading plan ID
export async function getActivePlanIdAsync(): Promise<string | null> {
  return getActivePlanIdFromStorage();
}

// Set the active reading plan
export async function setActivePlanIdAsync(planId: string | null): Promise<void> {
  return setActivePlanIdInStorage(planId);
}

// Get progress for all plans
export async function getAllProgressAsync(): Promise<Record<string, ReadingPlanProgress>> {
  return getAllPlanProgress();
}

// Get progress for a specific plan
export async function getPlanProgressAsync(planId: string): Promise<ReadingPlanProgress | null> {
  const allProgress = await getAllPlanProgress();
  return allProgress[planId] || null;
}

// Start a new reading plan
export async function startReadingPlanAsync(planId: string, pacing: 'scheduled' | 'openended' = 'scheduled'): Promise<ReadingPlanProgress> {
  const progress: ReadingPlanProgress = {
    planId,
    startDate: new Date().toISOString().split('T')[0],
    completedDays: [],
    lastReadDate: null,
    pacing,
  };

  await saveSinglePlanProgress(planId, progress);
  await setActivePlanIdInStorage(planId);
  return progress;
}

// Mark a day as completed
export async function markDayCompletedAsync(planId: string, dayNumber: number): Promise<ReadingPlanProgress | null> {
  const progress = await getPlanProgressAsync(planId);
  if (!progress) return null;

  if (!progress.completedDays.includes(dayNumber)) {
    progress.completedDays.push(dayNumber);
    progress.completedDays.sort((a, b) => a - b);
  }
  progress.lastReadDate = new Date().toISOString().split('T')[0];

  await saveSinglePlanProgress(planId, progress);
  return progress;
}

// Mark a day as not completed
export async function markDayNotCompletedAsync(planId: string, dayNumber: number): Promise<ReadingPlanProgress | null> {
  const progress = await getPlanProgressAsync(planId);
  if (!progress) return null;

  progress.completedDays = progress.completedDays.filter(d => d !== dayNumber);
  await saveSinglePlanProgress(planId, progress);
  return progress;
}

// Reset progress for a plan
export async function resetProgressAsync(planId: string): Promise<void> {
  const allProgress = await getAllPlanProgress();
  delete allProgress[planId];
  await savePlanProgress(allProgress);

  // If this was the active plan, clear it
  const activePlan = await getActivePlanIdFromStorage();
  if (activePlan === planId) {
    await setActivePlanIdInStorage(null);
  }
}

// ============================================
// Sync API (uses localStorage directly)
// For backwards compatibility and initial render
// ============================================

const ACTIVE_PLAN_KEY = 'activeReadingPlan';
const PROGRESS_KEY = 'readingPlanProgress';

// Get the active reading plan ID (sync)
export function getActivePlanId(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(ACTIVE_PLAN_KEY);
    if (!stored) return null;
    // Parse JSON since we store as JSON.stringify()
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// Set the active reading plan (sync)
export function setActivePlanId(planId: string | null): void {
  if (typeof window === 'undefined') return;

  try {
    if (planId) {
      // Store as JSON to be consistent with userData.ts which uses JSON.stringify
      localStorage.setItem(ACTIVE_PLAN_KEY, JSON.stringify(planId));
    } else {
      localStorage.removeItem(ACTIVE_PLAN_KEY);
    }
    // Also update IndexedDB in background
    setActivePlanIdInStorage(planId);
  } catch (e) {
    console.error('Failed to save active plan:', e);
  }
}

// Get progress for all plans (sync)
export function getAllProgress(): Record<string, ReadingPlanProgress> {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(PROGRESS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore errors
  }
  return {};
}

// Get progress for a specific plan (sync)
export function getPlanProgress(planId: string): ReadingPlanProgress | null {
  const allProgress = getAllProgress();
  return allProgress[planId] || null;
}

// Start a new reading plan (sync)
export function startReadingPlan(planId: string, pacing: 'scheduled' | 'openended' = 'scheduled'): ReadingPlanProgress {
  const progress: ReadingPlanProgress = {
    planId,
    startDate: new Date().toISOString().split('T')[0],
    completedDays: [],
    lastReadDate: null,
    pacing,
  };

  saveProgress(planId, progress);
  setActivePlanId(planId);
  return progress;
}

// Save progress for a plan (sync)
export function saveProgress(planId: string, progress: ReadingPlanProgress): void {
  if (typeof window === 'undefined') return;

  try {
    const allProgress = getAllProgress();
    allProgress[planId] = progress;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(allProgress));
    // Also update IndexedDB in background
    savePlanProgress(allProgress);
  } catch (e) {
    console.error('Failed to save progress:', e);
  }
}

// Mark a day as completed (sync)
export function markDayCompleted(planId: string, dayNumber: number): ReadingPlanProgress | null {
  const progress = getPlanProgress(planId);
  if (!progress) return null;

  if (!progress.completedDays.includes(dayNumber)) {
    progress.completedDays.push(dayNumber);
    progress.completedDays.sort((a, b) => a - b);
  }
  progress.lastReadDate = new Date().toISOString().split('T')[0];

  saveProgress(planId, progress);
  return progress;
}

// Mark a day as not completed (sync)
export function markDayNotCompleted(planId: string, dayNumber: number): ReadingPlanProgress | null {
  const progress = getPlanProgress(planId);
  if (!progress) return null;

  progress.completedDays = progress.completedDays.filter(d => d !== dayNumber);
  saveProgress(planId, progress);
  return progress;
}

// Reset progress for a plan (sync)
export function resetProgress(planId: string): void {
  if (typeof window === 'undefined') return;

  try {
    const allProgress = getAllProgress();
    delete allProgress[planId];
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(allProgress));

    // If this was the active plan, clear it
    if (getActivePlanId() === planId) {
      setActivePlanId(null);
    }

    // Also update IndexedDB in background
    savePlanProgress(allProgress);
  } catch (e) {
    console.error('Failed to reset progress:', e);
  }
}

// ============================================
// Pure calculation functions (no storage)
// ============================================

// Calculate which day we should be on based on start date
export function calculateCurrentDay(startDate: string): number {
  const start = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return diffDays + 1; // Day 1 is the start date
}

// Get today's reading for a plan
export function getTodaysReading(plan: ReadingPlan, progress: ReadingPlanProgress): DayReading | null {
  // Open-ended mode: just return the first uncompleted day
  if (progress.pacing === 'openended') {
    for (let day = 1; day <= plan.days; day++) {
      if (!progress.completedDays.includes(day)) {
        return plan.readings.find(r => r.day === day) || null;
      }
    }
    return null;
  }

  // Scheduled mode: based on calendar day
  const currentDay = calculateCurrentDay(progress.startDate);

  // If we're past the plan's duration, return the last day
  const dayNumber = Math.min(currentDay, plan.days);

  // Find the next uncompleted day starting from today or earlier
  for (let day = dayNumber; day >= 1; day--) {
    if (!progress.completedDays.includes(day)) {
      return plan.readings.find(r => r.day === day) || null;
    }
  }

  // If all days up to today are completed, show the next uncompleted day
  for (let day = dayNumber + 1; day <= plan.days; day++) {
    if (!progress.completedDays.includes(day)) {
      return plan.readings.find(r => r.day === day) || null;
    }
  }

  // All days completed
  return null;
}

// Calculate streak (consecutive days of reading)
export function calculateStreak(progress: ReadingPlanProgress): number {
  if (!progress.lastReadDate) return 0;

  const lastRead = new Date(progress.lastReadDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  lastRead.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - lastRead.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // If last read was more than 1 day ago, streak is broken
  if (diffDays > 1) return 0;

  // Count consecutive days backwards from last read date
  let streak = 0;
  const completedSet = new Set(progress.completedDays);
  const startDay = calculateCurrentDay(progress.startDate);

  for (let day = startDay; day >= 1; day--) {
    if (completedSet.has(day)) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// Calculate completion percentage
export function calculateCompletionPercentage(progress: ReadingPlanProgress, totalDays: number): number {
  if (totalDays === 0) return 0;
  return Math.round((progress.completedDays.length / totalDays) * 100);
}
