import { useEffect, useRef, useState } from "react";
import type { Prescription } from "../api/types";
import { beep } from "../audio";
import { formatClock } from "../format";
import { getLastSet, saveLastSet } from "../localHistory";
import type { CompletionPrefill } from "./CompleteActionForm";
import { FocusLabel } from "./FocusLabel";

interface LoggedSet {
  weight: string;
  reps: number;
}

export function SetLogger({
  exerciseId,
  prescription,
  onFinish,
  onCancel,
}: {
  exerciseId: string;
  prescription: Prescription;
  onFinish: (result: CompletionPrefill) => void;
  onCancel: () => void;
}) {
  const totalSets = prescription.sets ?? 1;
  const restSec = prescription.restSec ?? 0;
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);

  const lastTime = getLastSet(exerciseId);
  const [weightInput, setWeightInput] = useState(lastTime?.weight ?? "");
  const [repsInput, setRepsInput] = useState(lastTime?.reps ?? prescription.reps ?? 0);

  // Rest-between-sets countdown.
  const [resting, setResting] = useState(false);
  const [remainingSec, setRemainingSec] = useState(0);
  // Sub-second precision, used only to drive the ring's fill smoothly — the
  // clock digits stay on whole seconds (remainingSec).
  const [remainingMs, setRemainingMs] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const phaseEndRef = useRef<number | null>(null);

  const currentSetNumber = loggedSets.length + 1;

  function startRest() {
    beep(660, 200);
    setResting(true);
    setRemainingSec(restSec);
    setRemainingMs(restSec * 1000);
    phaseEndRef.current = Date.now() + restSec * 1000;
    setIsRunning(true);
  }

  useEffect(() => {
    if (!resting || !isRunning) return;
    let rafId: number;

    function tick() {
      const end = phaseEndRef.current;
      if (end === null) return;
      const remainingMsValue = Math.max(0, end - Date.now());
      const remaining = Math.round(remainingMsValue / 1000);
      setRemainingSec(remaining);
      setRemainingMs(remainingMsValue);
      if (remaining === 0) {
        beep(880, 150);
        setResting(false);
        setIsRunning(false);
        return;
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [resting, isRunning]);

  function handlePauseResumeRest() {
    if (isRunning) {
      phaseEndRef.current = null;
      setIsRunning(false);
    } else {
      phaseEndRef.current = Date.now() + remainingMs;
      setIsRunning(true);
    }
  }

  function handleSkipRest() {
    setResting(false);
    setIsRunning(false);
  }

  function handleLogSet() {
    const entry: LoggedSet = { weight: weightInput.trim(), reps: repsInput };
    const updated = [...loggedSets, entry];
    setLoggedSets(updated);
    saveLastSet(exerciseId, entry);

    if (updated.length >= totalSets) {
      onFinish({ setsCompleted: updated.length, repsCompleted: entry.reps, load: entry.weight || undefined });
      return;
    }

    if (restSec > 0) {
      startRest();
    }
  }

  function handleFinishNow() {
    const last = loggedSets[loggedSets.length - 1];
    onFinish({
      setsCompleted: loggedSets.length,
      repsCompleted: last?.reps ?? repsInput,
      load: last?.weight || weightInput.trim() || undefined,
    });
  }

  if (resting) {
    // Fraction of time remaining (not elapsed) — the ring should drain as the
    // countdown runs out, not fill up. Uses sub-second remainingMs so the ring
    // animates smoothly instead of jumping once per second.
    const percent = restSec > 0 ? (remainingMs / (restSec * 1000)) * 100 : 0;
    return (
      <div className="exercise-timer exercise-timer--rest">
        <FocusLabel text="Rest" variant="rest" />
        <div className="exercise-timer__clock-wrap">
          <svg className="exercise-timer__ring" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" className="exercise-timer__ring-track" />
            <circle
              cx="60"
              cy="60"
              r="54"
              className="exercise-timer__ring-fill"
              style={{ strokeDashoffset: 339.3 * (1 - percent / 100) }}
            />
          </svg>
          <span className="exercise-timer__clock">{formatClock(remainingSec)}</span>
        </div>
        <p className="set-logger__hint">
          Next: Set {currentSetNumber} of {totalSets}
        </p>
        <div className="exercise-timer__controls">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button" onClick={handlePauseResumeRest}>
            {isRunning ? "Pause" : "Resume"}
          </button>
          <button type="button" className="button button--primary" onClick={handleSkipRest}>
            Skip rest
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="set-logger">
      <FocusLabel text={`Set ${currentSetNumber} of ${totalSets}`} />

      {lastTime && loggedSets.length === 0 && (
        <p className="set-logger__hint">Last time: {lastTime.weight ? `${lastTime.weight} × ` : ""}{lastTime.reps} reps</p>
      )}

      {loggedSets.length > 0 && (
        <ul className="set-logger__history">
          {loggedSets.map((set, i) => (
            <li key={i}>
              Set {i + 1}: {set.weight ? `${set.weight} × ` : ""}
              {set.reps} reps
            </li>
          ))}
        </ul>
      )}

      <div className="set-logger__inputs">
        <label className="field">
          Weight/load (optional)
          <input
            type="text"
            inputMode="decimal"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder="e.g. 135 lbs, bodyweight"
          />
        </label>
        <label className="field">
          Reps
          <input type="number" min={0} value={repsInput} onChange={(e) => setRepsInput(Number(e.target.value))} />
        </label>
      </div>

      <div className="set-logger__controls">
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="button button--primary button--large" onClick={handleLogSet}>
          Log Set {currentSetNumber}
        </button>
      </div>

      {loggedSets.length > 0 && loggedSets.length < totalSets && (
        <button type="button" className="button set-logger__finish-early" onClick={handleFinishNow}>
          Finish now ({loggedSets.length} of {totalSets} sets logged)
        </button>
      )}
    </div>
  );
}
