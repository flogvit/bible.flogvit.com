

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  ReadingPlan,
  ReadingPlanSummary,
  ReadingPlanProgress,
  DayReading,
  getActivePlanId,
  setActivePlanId,
  getPlanProgress,
  startReadingPlan,
  markDayCompleted,
  markDayNotCompleted,
  getTodaysReading,
  calculateStreak,
  calculateCompletionPercentage,
  calculateCurrentDay,
  resetProgress,
} from '@/lib/reading-plan';
import { useSyncRefresh } from './SyncContext';

interface ReadingPlanContextType {
  // All available plans
  availablePlans: ReadingPlanSummary[];
  loadingPlans: boolean;

  // Active plan
  activePlan: ReadingPlan | null;
  activeProgress: ReadingPlanProgress | null;
  loadingActivePlan: boolean;

  // Computed values
  todaysReading: DayReading | null;
  currentDay: number;
  streak: number;
  completionPercentage: number;

  // Pacing mode
  isOpenEnded: boolean;

  // Actions
  selectPlan: (planId: string) => Promise<void>;
  startPlan: (planId: string, pacing?: 'scheduled' | 'openended') => void;
  markComplete: (dayNumber: number) => void;
  markIncomplete: (dayNumber: number) => void;
  reset: () => void;
  refreshProgress: () => void;
}

const ReadingPlanContext = createContext<ReadingPlanContextType | null>(null);

export function ReadingPlanProvider({ children }: { children: ReactNode }) {
  const [availablePlans, setAvailablePlans] = useState<ReadingPlanSummary[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [activePlan, setActivePlan] = useState<ReadingPlan | null>(null);
  const [activeProgress, setActiveProgress] = useState<ReadingPlanProgress | null>(null);
  const [loadingActivePlan, setLoadingActivePlan] = useState(false);

  // Load available plans on mount
  useEffect(() => {
    async function loadPlans() {
      try {
        const res = await fetch('/api/reading-plans');
        if (res.ok) {
          const plans = await res.json();
          setAvailablePlans(plans);
        }
      } catch (e) {
        console.error('Failed to load reading plans:', e);
      } finally {
        setLoadingPlans(false);
      }
    }
    loadPlans();
  }, []);

  // Load active plan on mount
  useEffect(() => {
    const activePlanId = getActivePlanId();
    if (activePlanId) {
      loadPlan(activePlanId);
    }
  }, []);

  async function loadPlan(planId: string) {
    setLoadingActivePlan(true);
    try {
      const res = await fetch(`/api/reading-plans/${planId}`);
      if (res.ok) {
        const plan = await res.json();
        setActivePlan(plan);
        const progress = getPlanProgress(planId);
        setActiveProgress(progress);
      }
    } catch (e) {
      console.error('Failed to load plan:', e);
    } finally {
      setLoadingActivePlan(false);
    }
  }

  // Refresh from storage after sync
  const refreshFromStorageForSync = useCallback(() => {
    const activePlanId = getActivePlanId();
    if (activePlanId) {
      const progress = getPlanProgress(activePlanId);
      setActiveProgress(progress);
    }
  }, []);
  useSyncRefresh(refreshFromStorageForSync);

  const selectPlan = useCallback(async (planId: string) => {
    setActivePlanId(planId);
    await loadPlan(planId);
  }, []);

  const startPlan = useCallback((planId: string, pacing: 'scheduled' | 'openended' = 'scheduled') => {
    const progress = startReadingPlan(planId, pacing);
    setActiveProgress(progress);
    setActivePlanId(planId);
    loadPlan(planId);
  }, []);

  const markComplete = useCallback((dayNumber: number) => {
    if (!activePlan) return;
    const newProgress = markDayCompleted(activePlan.id, dayNumber);
    if (newProgress) {
      setActiveProgress({ ...newProgress });
    }
  }, [activePlan]);

  const markIncomplete = useCallback((dayNumber: number) => {
    if (!activePlan) return;
    const newProgress = markDayNotCompleted(activePlan.id, dayNumber);
    if (newProgress) {
      setActiveProgress({ ...newProgress });
    }
  }, [activePlan]);

  const reset = useCallback(() => {
    if (!activePlan) return;
    resetProgress(activePlan.id);
    setActiveProgress(null);
    setActivePlan(null);
  }, [activePlan]);

  const refreshProgress = useCallback(() => {
    if (activePlan) {
      const progress = getPlanProgress(activePlan.id);
      setActiveProgress(progress);
    }
  }, [activePlan]);

  // Computed values
  const isOpenEnded = activeProgress?.pacing === 'openended';

  const todaysReading = activePlan && activeProgress
    ? getTodaysReading(activePlan, activeProgress)
    : null;

  const currentDay = activeProgress
    ? calculateCurrentDay(activeProgress.startDate)
    : 0;

  const streak = activeProgress
    ? calculateStreak(activeProgress)
    : 0;

  const completionPercentage = activeProgress && activePlan
    ? calculateCompletionPercentage(activeProgress, activePlan.days)
    : 0;

  return (
    <ReadingPlanContext.Provider
      value={{
        availablePlans,
        loadingPlans,
        activePlan,
        activeProgress,
        loadingActivePlan,
        todaysReading,
        currentDay,
        streak,
        completionPercentage,
        isOpenEnded,
        selectPlan,
        startPlan,
        markComplete,
        markIncomplete,
        reset,
        refreshProgress,
      }}
    >
      {children}
    </ReadingPlanContext.Provider>
  );
}

export function useReadingPlan() {
  const context = useContext(ReadingPlanContext);
  if (!context) {
    throw new Error('useReadingPlan must be used within ReadingPlanProvider');
  }
  return context;
}
