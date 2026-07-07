import { useCallback, useEffect, useRef, useState } from "react";
import { currentTimezone, getNextAction, submitResult } from "../api/client";
import type { ActualResult, NextActionResponse } from "../api/types";
import { CompleteActionForm } from "../components/CompleteActionForm";
import { NextActionCard } from "../components/NextActionCard";
import { StateSummary } from "../components/StateSummary";
import { TodayProgress } from "../components/TodayProgress";

export function NextActionScreen({ userId }: { userId: string }) {
  const [response, setResponse] = useState<NextActionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startedAtRef = useRef<string>(new Date().toISOString());

  const loadNext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getNextAction(userId);
      setResponse(next);
      startedAtRef.current = new Date().toISOString();
      setCompleting(false);
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

  return (
    <div className="next-action-screen">
      <TodayProgress progress={response.todayProgress} />
      <StateSummary summary={response.stateSummary} />

      <NextActionCard action={response.nextAction} />

      {error && <p className="status-message status-message--error">{error}</p>}

      {completing ? (
        <CompleteActionForm
          action={response.nextAction}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() => setCompleting(false)}
        />
      ) : (
        <button className="button button--primary button--large" onClick={() => setCompleting(true)}>
          {response.nextAction.type === "rest" ? "Acknowledge" : "Mark Complete"}
        </button>
      )}
    </div>
  );
}
