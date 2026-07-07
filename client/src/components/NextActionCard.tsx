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

export function NextActionCard({ action }: { action: NextAction }) {
  const isRest = action.type === "rest";
  const prescriptionSummary = formatPrescription(action);
  const duration = formatDuration(action.estimatedDurationSec);

  return (
    <article className={`next-action-card ${isRest ? "next-action-card--rest" : ""}`}>
      <div className="next-action-card__header">
        <span className="next-action-card__icon" aria-hidden="true">
          {action.icon ?? (isRest ? "🧘" : "🏔️")}
        </span>
        <div>
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

      {action.instructions.length > 0 && (
        <ol className="next-action-card__instructions">
          {action.instructions.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}

      {action.why.length > 0 && (
        <details className="next-action-card__why">
          <summary>Why this?</summary>
          <ul>
            {action.why.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
