import { useState } from "react";
import { exerciseImageUrl } from "../api/client";
import type { NextAction } from "../api/types";

function formatDuration(seconds: number | null): string | undefined {
  if (seconds === null) return undefined;
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? "~1 min" : `~${minutes} min`;
}

function formatPrescription(action: NextAction): string | undefined {
  const p = action.prescription;
  if (!p) return undefined;

  const parts: string[] = [];
  if (p.sets) parts.push(`${p.sets} set${p.sets > 1 ? "s" : ""}`);
  if (p.reps) parts.push(`${p.reps} reps`);
  if (p.durationSec) parts.push(p.sets ? `${p.durationSec}s hold` : `${Math.round(p.durationSec / 60)} min`);
  if (p.restSec) parts.push(`${p.restSec}s rest`);
  return parts.join(" × ");
}

function ExerciseThumbnail({ action }: { action: NextAction }) {
  const [imageFailed, setImageFailed] = useState(false);
  const isRest = action.type === "rest";
  const fallbackIcon = action.icon ?? (isRest ? "🧘" : "🏔️");

  if (isRest || !action.exerciseId || imageFailed) {
    return (
      <span className="next-action-card__icon" aria-hidden="true">
        {fallbackIcon}
      </span>
    );
  }

  return (
    <img
      className="next-action-card__thumbnail"
      src={exerciseImageUrl(action.exerciseId)}
      alt={action.title}
      onError={() => setImageFailed(true)}
    />
  );
}

/** Full-width version of the exercise image, used in the Description sub-tab. */
export function ExerciseFullImage({ action }: { action: NextAction }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (action.type === "rest" || !action.exerciseId || imageFailed) {
    return null;
  }

  return (
    <img
      className="exercise-detail-panel__image"
      src={exerciseImageUrl(action.exerciseId)}
      alt={action.title}
      onError={() => setImageFailed(true)}
    />
  );
}

/**
 * Persistent header only — image/icon, name, and prescription summary. Stays
 * visible no matter which of the Action / Description / Why sub-tabs (owned
 * by AppShell) is currently selected.
 */
export function NextActionCard({ action }: { action: NextAction }) {
  const prescriptionSummary = formatPrescription(action);
  const duration = formatDuration(action.estimatedDurationSec);

  return (
    <article className="next-action-card">
      <div className="next-action-card__header">
        <ExerciseThumbnail action={action} />
        <div className="next-action-card__heading">
          <h2>{action.title}</h2>
          {(prescriptionSummary || duration) && (
            <p className="next-action-card__meta">
              {prescriptionSummary}
              {prescriptionSummary && duration ? " · " : ""}
              {duration}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
