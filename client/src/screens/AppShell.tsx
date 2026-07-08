import { useCallback, useEffect, useRef, useState } from "react";
import { currentTimezone, getNextAction, submitResult } from "../api/client";
import type { ActualResult, NextActionResponse } from "../api/types";
import { CompleteActionForm, type CompletionPrefill } from "../components/CompleteActionForm";
import { ExerciseTimer } from "../components/ExerciseTimer";
import { FocusLabel } from "../components/FocusLabel";
import { ExerciseFullImage, NextActionCard } from "../components/NextActionCard";
import { SetLogger } from "../components/SetLogger";
import { StateSummary } from "../components/StateSummary";
import { TabBar, type TabDef } from "../components/TabBar";
import { TodayProgress } from "../components/TodayProgress";

type View = "action" | "timer" | "sets" | "form";
type TabId = "current" | "today" | "overall";
type ExerciseSubTab = "action" | "description" | "why";

export function AppShell({ userId }: { userId: string }) {
  const [response, setResponse] = useState<NextActionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("action");
  const [completionPrefill, setCompletionPrefill] = useState<CompletionPrefill | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("current");
  const [exerciseSubTab, setExerciseSubTab] = useState<ExerciseSubTab>("action");
  const startedAtRef = useRef<string>(new Date().toISOString());

  const loadNext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getNextAction(userId);
      setResponse(next);
      startedAtRef.current = new Date().toISOString();
      setView("action");
      setCompletionPrefill(null);
      setExerciseSubTab("action");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  async function handleSubmit(actual: ActualResult) {
    if (!response) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitResult(userId, {
        recommendationId: response.nextAction.recommendationId,
        exerciseId: response.nextAction.exerciseId,
        timezone: currentTimezone(),
        startedAt: startedAtRef.current,
        completedAt: new Date().toISOString(),
        actual,
      });
      await loadNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !response) {
    return <p className="status-message">Loading next action…</p>;
  }

  if (error && !response) {
    return (
      <div className="status-message status-message--error">
        <p>{error}</p>
        <button className="button" onClick={loadNext}>
          Retry
        </button>
      </div>
    );
  }

  if (!response) return null;

  const { nextAction } = response;
  const isTimed = nextAction.type === "exercise" && !!nextAction.prescription?.durationSec;
  const isSetBased = nextAction.type === "exercise" && !!nextAction.prescription?.reps && !isTimed;

  function handleFinishInteractive(result: CompletionPrefill) {
    setCompletionPrefill(result);
    setView("form");
  }

  const tabs: TabDef[] = [
    { id: "current", label: "Current Exercise" },
    { id: "today", label: "Today", badge: `${response.todayProgress.percentComplete}%` },
    { id: "overall", label: "Overall" },
  ];

  return (
    <div className="app-shell">
      <TabBar tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as TabId)} />

      {error && <p className="status-message status-message--error">{error}</p>}

      {/* All tab panels stay mounted (hidden via CSS, not unmounted) so switching
          tabs mid-exercise doesn't reset a running timer or in-progress set log. */}
      <div className="tab-panel" hidden={activeTab !== "current"}>
        <NextActionCard action={nextAction} />

        <div className="exercise-subtabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={exerciseSubTab === "action"}
            className={`exercise-subtab ${exerciseSubTab === "action" ? "exercise-subtab--active" : ""}`}
            onClick={() => setExerciseSubTab("action")}
          >
            Action
          </button>
          {nextAction.instructions.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={exerciseSubTab === "description"}
              className={`exercise-subtab ${exerciseSubTab === "description" ? "exercise-subtab--active" : ""}`}
              onClick={() => setExerciseSubTab("description")}
            >
              Description
            </button>
          )}
          {nextAction.why.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={exerciseSubTab === "why"}
              className={`exercise-subtab ${exerciseSubTab === "why" ? "exercise-subtab--active" : ""}`}
              onClick={() => setExerciseSubTab("why")}
            >
              Why
            </button>
          )}
        </div>

        {/* Sub-panels also stay mounted for the same reason as the top-level tabs —
            a running timer must survive a peek at Description or Why. */}
        <div className="tab-panel" hidden={exerciseSubTab !== "action"}>
          {view === "timer" && nextAction.prescription && (
            <ExerciseTimer
              prescription={nextAction.prescription}
              onFinish={handleFinishInteractive}
              onCancel={() => setView("action")}
            />
          )}

          {view === "sets" && nextAction.prescription && nextAction.exerciseId && (
            <SetLogger
              exerciseId={nextAction.exerciseId}
              prescription={nextAction.prescription}
              onFinish={handleFinishInteractive}
              onCancel={() => setView("action")}
            />
          )}

          {view === "form" && (
            <CompleteActionForm
              action={nextAction}
              submitting={submitting}
              prefill={completionPrefill ?? undefined}
              onSubmit={handleSubmit}
              onCancel={() => setView("action")}
            />
          )}

          {view === "action" && (
            <div className="action-prompt">
              <FocusLabel
                text={nextAction.type === "rest" ? "Rest" : "Ready"}
                variant={nextAction.type === "rest" ? "rest" : "primary"}
              />
              <button
                className="button button--primary button--large"
                onClick={() => setView(isTimed ? "timer" : isSetBased ? "sets" : "form")}
              >
                {nextAction.type === "rest" ? "Acknowledge" : isTimed || isSetBased ? "Start" : "Mark Complete"}
              </button>
            </div>
          )}
        </div>

        {nextAction.instructions.length > 0 && (
          <div className="tab-panel" hidden={exerciseSubTab !== "description"}>
            <div className="exercise-detail-panel">
              <ol className="next-action-card__instructions">
                {nextAction.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              <ExerciseFullImage action={nextAction} />
            </div>
          </div>
        )}

        {nextAction.why.length > 0 && (
          <div className="tab-panel" hidden={exerciseSubTab !== "why"}>
            <div className="exercise-detail-panel">
              <ul className="next-action-card__why-list">
                {nextAction.why.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="tab-panel" hidden={activeTab !== "today"}>
        <TodayProgress progress={response.todayProgress} />
        <StateSummary summary={response.stateSummary} />
      </div>

      <div className="tab-panel" hidden={activeTab !== "overall"}>
        <div className="placeholder-panel">
          <p>Overall progress is coming soon.</p>
        </div>
      </div>
    </div>
  );
}
