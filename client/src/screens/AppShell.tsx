import { useCallback, useEffect, useRef, useState } from "react";
import { currentTimezone, getHistory, getNextAction, submitResult } from "../api/client";
import type { ActualResult, HistoryEntry, NextActionResponse } from "../api/types";
import { CompleteActionForm, type CompletionPrefill } from "../components/CompleteActionForm";
import { ExerciseTimer } from "../components/ExerciseTimer";
import { FocusLabel } from "../components/FocusLabel";
import { HistoryList } from "../components/HistoryList";
import { ExerciseFullImage, NextActionCard } from "../components/NextActionCard";
import { SetLogger } from "../components/SetLogger";
import { StateSummary } from "../components/StateSummary";
import { TabBar, type TabDef } from "../components/TabBar";
import { TimeTravelBar } from "../components/TimeTravelBar";
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

  // Dev time-travel: an offset added to the real clock, not a frozen instant --
  // it keeps ticking naturally between clicks, each click just moves it further
  // ahead. Threaded into every now/startedAt/completedAt the client sends,
  // mirroring the server's own "time is explicit, not ambient" design
  // (docs/spec/11-core-principle.md), which is exactly what makes this possible
  // without a server change.
  const [timeOffsetMs, setTimeOffsetMs] = useState(0);
  const simulatedNow = useCallback(() => new Date(Date.now() + timeOffsetMs), [timeOffsetMs]);

  const loadNext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getNextAction(userId, simulatedNow());
      setResponse(next);
      startedAtRef.current = simulatedNow().toISOString();
      setView("action");
      setCompletionPrefill(null);
      setExerciseSubTab("action");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [userId, simulatedNow]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  // History (Overall tab): fetched once, the first time that tab is opened --
  // not on mount (avoids fetching data the user may never look at), not on every
  // tab switch back (avoids redundant refetches). Nothing else in AppShell
  // prefetches a tab's data ahead of it becoming active either (Today reads off
  // the already-loaded GET /next response), so this stays consistent with that.
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryError(null);
    try {
      const { history } = await getHistory(userId);
      setHistory(history);
      setHistoryLoaded(true);
    } catch (err) {
      // Previously silent -- a failed fetch left the Overall tab showing an
      // empty list with no indication anything went wrong.
      setHistoryError(err instanceof Error ? err.message : String(err));
    }
  }, [userId]);

  useEffect(() => {
    if (activeTab === "overall" && !historyLoaded && !historyError) {
      loadHistory();
    }
  }, [activeTab, historyLoaded, historyError, loadHistory]);

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
        completedAt: simulatedNow().toISOString(),
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
      <TimeTravelBar simulatedNow={simulatedNow()} onAdvance={(delta) => setTimeOffsetMs((prev) => prev + delta)} />

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
        {historyError ? (
          <div className="status-message status-message--error">
            <p>{historyError}</p>
            <button className="button" onClick={loadHistory}>
              Retry
            </button>
          </div>
        ) : (
          <HistoryList entries={history} />
        )}
      </div>
    </div>
  );
}
