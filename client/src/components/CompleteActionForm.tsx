import { useState } from "react";
import type { ActualResult, Difficulty, NextAction } from "../api/types";

const DIFFICULTY_OPTIONS: Difficulty[] = ["too_easy", "easy", "normal", "hard", "too_hard"];

function difficultyLabel(value: Difficulty): string {
  return value.replace(/_/g, " ");
}

export function CompleteActionForm({
  action,
  submitting,
  onSubmit,
  onCancel,
}: {
  action: NextAction;
  submitting: boolean;
  onSubmit: (actual: ActualResult) => void;
  onCancel: () => void;
}) {
  const prescription = action.prescription;

  const [setsCompleted, setSetsCompleted] = useState(prescription?.sets ?? 0);
  const [repsCompleted, setRepsCompleted] = useState(prescription?.reps ?? 0);
  const [durationSecCompleted, setDurationSecCompleted] = useState(prescription?.durationSec ?? 0);
  const [maxPain, setMaxPain] = useState(0);
  const [rpe, setRpe] = useState(prescription?.targetRpe ?? 5);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [notes, setNotes] = useState("");

  if (action.type === "rest") {
    return (
      <div className="complete-form">
        <p>No exercise to log — just acknowledging the rest recommendation.</p>
        <div className="complete-form__actions">
          <button
            className="button button--primary"
            disabled={submitting}
            onClick={() =>
              onSubmit({ maxPain: 0, rpe: 0, difficulty: "normal", notes: "Rest acknowledged." })
            }
          >
            {submitting ? "Saving…" : "Acknowledge"}
          </button>
        </div>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const actual: ActualResult = { maxPain, rpe, difficulty };
    if (prescription?.sets) actual.setsCompleted = setsCompleted;
    if (prescription?.reps) actual.repsCompleted = repsCompleted;
    if (prescription?.durationSec) actual.durationSecCompleted = durationSecCompleted;
    if (notes.trim()) actual.notes = notes.trim();
    onSubmit(actual);
  }

  return (
    <form className="complete-form" onSubmit={handleSubmit}>
      {prescription?.sets !== undefined && (
        <label className="field">
          Sets completed
          <input
            type="number"
            min={0}
            value={setsCompleted}
            onChange={(e) => setSetsCompleted(Number(e.target.value))}
          />
        </label>
      )}

      {prescription?.reps !== undefined && (
        <label className="field">
          Reps completed (last set)
          <input
            type="number"
            min={0}
            value={repsCompleted}
            onChange={(e) => setRepsCompleted(Number(e.target.value))}
          />
        </label>
      )}

      {prescription?.durationSec !== undefined && (
        <label className="field">
          Duration completed (seconds)
          <input
            type="number"
            min={0}
            value={durationSecCompleted}
            onChange={(e) => setDurationSecCompleted(Number(e.target.value))}
          />
        </label>
      )}

      <label className="field">
        Highest pain (0 = none, 10 = worst)
        <input type="range" min={0} max={10} value={maxPain} onChange={(e) => setMaxPain(Number(e.target.value))} />
        <span className="field__value">{maxPain}</span>
      </label>

      <label className="field">
        Effort / RPE (1 = very easy, 10 = maximal)
        <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} />
        <span className="field__value">{rpe}</span>
      </label>

      <label className="field">
        How did it feel?
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
          {DIFFICULTY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {difficultyLabel(option)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Anything unusual? (optional)
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>

      <div className="complete-form__actions">
        <button type="button" className="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? "Saving…" : "Mark Complete"}
        </button>
      </div>
    </form>
  );
}
