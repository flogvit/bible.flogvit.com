import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useReadingPlan } from '@/components/ReadingPlanContext';
import { getBookInfoById } from '@/lib/books-data';
import { toUrlSlug } from '@/lib/url-utils';
import { ReadingPlanSummary } from '@/lib/reading-plan';
import styles from './ReadingPlanClient.module.scss';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ItemTagging } from '@/components/ItemTagging';

export function ReadingPlanClient() {
  const {
    availablePlans,
    loadingPlans,
    activePlan,
    activeProgress,
    todaysReading,
    currentDay,
    streak,
    completionPercentage,
    isOpenEnded,
    startPlan,
    markComplete,
    markIncomplete,
    reset,
  } = useReadingPlan();

  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [startingPlanId, setStartingPlanId] = useState<string | null>(null);

  // Group plans by category
  const categories = [
    { id: 'kort', name: 'Korte planer', description: 'Under 3 måneder' },
    { id: 'middels', name: 'Mellomstore planer', description: '3-6 måneder' },
    { id: 'lang', name: 'Lange planer', description: 'Over 6 måneder' },
  ];

  const filteredPlans = selectedCategory
    ? availablePlans.filter(p => p.category === selectedCategory)
    : availablePlans;

  const handleStartPlan = (planId: string) => {
    setStartingPlanId(planId);
  };

  const handleStartWithPacing = (pacing: 'scheduled' | 'openended') => {
    if (startingPlanId) {
      startPlan(startingPlanId, pacing);
      setStartingPlanId(null);
    }
  };

  const handleReset = () => {
    reset();
    setShowConfirmReset(false);
  };

  if (loadingPlans) {
    return (
      <div className={styles.main}>
        <div className="container">
          <p className={styles.loading}>Laster leseplaner...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.main}>
      <div className="container">
        <Breadcrumbs items={[
          { label: 'Hjem', href: '/' },
          { label: 'Leseplan' }
        ]} />
        <header className={styles.header}>
          <h1>Leseplaner</h1>
          <p className="text-muted">Velg en leseplan og les Bibelen systematisk</p>
        </header>

        {/* Active plan progress */}
        {activePlan && activeProgress && (
          <section className={styles.activeSection}>
            <h2>Din aktive leseplan</h2>
            <div className={styles.activePlan}>
              <div className={styles.activePlanHeader}>
                <div>
                  <h3>{activePlan.name}</h3>
                  <p>{activePlan.description}</p>
                  <span className={styles.pacingBadge}>
                    {isOpenEnded ? 'Eget tempo' : 'Tidsplan'}
                  </span>
                </div>
                <button
                  onClick={() => setShowConfirmReset(true)}
                  className={styles.resetButton}
                >
                  Avslutt plan
                </button>
              </div>

              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{activeProgress.completedDays.length}</span>
                  <span className={styles.statLabel}>{isOpenEnded ? 'porsjoner lest' : 'dager lest'}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{activePlan.days - activeProgress.completedDays.length}</span>
                  <span className={styles.statLabel}>{isOpenEnded ? 'porsjoner igjen' : 'dager igjen'}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{completionPercentage}%</span>
                  <span className={styles.statLabel}>fullført</span>
                </div>
                {!isOpenEnded && streak > 0 && (
                  <div className={styles.stat}>
                    <span className={styles.statValue}>{streak}</span>
                    <span className={styles.statLabel}>dager på rad</span>
                  </div>
                )}
              </div>

              <div className={styles.progress}>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
              </div>

              {/* Today's / next reading */}
              {todaysReading && (
                <div className={styles.todaysReading}>
                  <h4>{isOpenEnded ? `Neste lesing (porsjon ${todaysReading.day})` : `Dagens lesing (dag ${todaysReading.day})`}</h4>
                  <div className={styles.chapters}>
                    {todaysReading.chapters.map((ch, i) => {
                      const book = getBookInfoById(ch.bookId);
                      if (!book) return null;
                      return (
                        <Link
                          key={i}
                          to={`/${toUrlSlug(book.short_name)}/${ch.chapter}`}
                          className={styles.chapterLink}
                        >
                          {book.name_no} {ch.chapter}
                        </Link>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => markComplete(todaysReading.day)}
                    className={styles.markButton}
                  >
                    {isOpenEnded ? `Marker porsjon ${todaysReading.day} som lest` : `Marker dag ${todaysReading.day} som lest`}
                  </button>
                </div>
              )}

              {/* Calendar view of progress */}
              <div className={styles.calendar}>
                <h4>Progresjon</h4>
                <div className={styles.dayGrid}>
                  {activePlan.readings.map((reading) => {
                    const isCompleted = activeProgress.completedDays.includes(reading.day);
                    const isCurrent = todaysReading?.day === reading.day;
                    return (
                      <button
                        key={reading.day}
                        className={`${styles.dayButton} ${isCompleted ? styles.completed : ''} ${isCurrent ? styles.current : ''}`}
                        onClick={() => isCompleted ? markIncomplete(reading.day) : markComplete(reading.day)}
                        title={`Dag ${reading.day}${isCompleted ? ' (lest)' : ''}`}
                      >
                        {reading.day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Confirm reset dialog */}
            {showConfirmReset && (
              <div className={styles.dialog}>
                <div className={styles.dialogContent}>
                  <h3>Avslutt leseplan?</h3>
                  <p>Er du sikker på at du vil avslutte &laquo;{activePlan.name}&raquo;? All progresjon vil bli slettet.</p>
                  <div className={styles.dialogButtons}>
                    <button onClick={() => setShowConfirmReset(false)} className={styles.cancelButton}>
                      Avbryt
                    </button>
                    <button onClick={handleReset} className={styles.confirmButton}>
                      Avslutt
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Pacing mode selection dialog */}
        {startingPlanId && (
          <div className={styles.dialog}>
            <div className={styles.dialogContent}>
              <h3>Velg modus</h3>
              <p>Hvordan vil du følge denne planen?</p>
              <div className={styles.pacingOptions}>
                <button onClick={() => handleStartWithPacing('scheduled')} className={styles.pacingOption}>
                  <strong>Følg tidsplan</strong>
                  <span>Les en porsjon per dag med streak-teller og kalendervisning</span>
                </button>
                <button onClick={() => handleStartWithPacing('openended')} className={styles.pacingOption}>
                  <strong>Eget tempo</strong>
                  <span>Les i ditt eget tempo uten tidspress</span>
                </button>
              </div>
              <div className={styles.dialogButtons}>
                <button onClick={() => setStartingPlanId(null)} className={styles.cancelButton}>
                  Avbryt
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Available plans */}
        <section className={styles.plansSection}>
          <h2>{activePlan ? 'Andre leseplaner' : 'Velg en leseplan'}</h2>

          <div className={styles.categoryFilter}>
            <button
              className={`${styles.categoryButton} ${!selectedCategory ? styles.active : ''}`}
              onClick={() => setSelectedCategory(null)}
            >
              Alle
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                className={`${styles.categoryButton} ${selectedCategory === cat.id ? styles.active : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className={styles.plansGrid}>
            {filteredPlans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isActive={activePlan?.id === plan.id}
                onStart={() => handleStartPlan(plan.id)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  isActive,
  onStart,
}: {
  plan: ReadingPlanSummary;
  isActive: boolean;
  onStart: () => void;
}) {
  const durationText = plan.days === 1 ? '1 dag' : `${plan.days} dager`;

  return (
    <div className={`${styles.planCard} ${isActive ? styles.activePlanCard : ''}`}>
      <div className={styles.planCardHeader}>
        <h3>{plan.name}</h3>
        <div className={styles.planCardActions}>
          <ItemTagging itemType="readingplan" itemId={plan.id} compact />
          <span className={styles.duration}>{durationText}</span>
        </div>
      </div>
      <p className={styles.planDescription}>{plan.description}</p>
      {isActive ? (
        <span className={styles.activeLabel}>Aktiv</span>
      ) : (
        <button onClick={onStart} className={styles.startButton}>
          Start denne planen
        </button>
      )}
    </div>
  );
}
