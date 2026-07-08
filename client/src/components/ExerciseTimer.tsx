import { useEffect, useRef, useState } from "react";
import type { Prescription } from "../api/types";
import { beep } from "../audio";
import { formatClock } from "../format";
import type { CompletionPrefill } from "./CompleteActionForm";
import { FocusLabel } from "./FocusLabel";

type Phase = "work" | "rest" | "done";

export function ExerciseTimer({
  prescription,
  onFinish,
  onCancel,
}: {
  prescription: Prescription;
  onFinish: (result: CompletionPrefill) => void;
  onCancel: () => void;
}) {
  const totalSets = prescription.sets ?? 1;
  const workSec = prescription.durationSec ?? 0;
  const restSec = prescription.restSec ?? 0;

  const [phase, setPhase] = useState<Phase>("work");
  const [setIndex, setSetIndex] = useState(1);
  const [remainingSec, setRemainingSec] = useState(workSec);
  // Sub-second precision, used only to drive the ring's fill smoothly — the
  // clock digits and dose bookkeeping stay on whole seconds (remainingSec).
  const [remainingMs, setRemainingMs] = useState(workSec * 1000);
  const [isRunning, setIsRunning] = useState(true);
  const completedWorkSecRef = useRef(0);
  const phaseEndRef = useRef<number | null>(null);

  // Starts running immediately on mount (the panel only opens once the user has
  // already pressed Start on the exercise card, so a second Start press in here
  // would be redundant) — lazily initialize the countdown target during render,
  // a React-sanctioned exception to "no side effects in render" for one-time setup.
  const didInitRef = useRef(false);
  if (!didInitRef.current) {
    phaseEndRef.current = Date.now() + workSec * 1000;
    didInitRef.current = true;
  }

  const didBeepRef = useRef(false);
  useEffect(() => {
    // Guarded against StrictMode's dev-only double-invoke of effects, which would
    // otherwise fire this twice on mount.
    if (didBeepRef.current) return;
    didBeepRef.current = true;
    beep(660, 120);
  }, []);

  // Advance to the given phase/set and (re)arm the countdown target.
  function armPhase(nextPhase: Phase, nextSetIndex: number, running: boolean) {
    const duration = nextPhase === "work" ? workSec : restSec;
    setPhase(nextPhase);
    setSetIndex(nextSetIndex);
    setRemainingSec(duration);
    setRemainingMs(duration * 1000);
    phaseEndRef.current = running ? Date.now() + duration * 1000 : null;
    setIsRunning(running);
  }

  useEffect(() => {
    if (!isRunning) return;
    let rafId: number;

    function tick() {
      const end = phaseEndRef.current;
      if (end === null) return;
      const remainingMsValue = Math.max(0, end - Date.now());
      const remaining = Math.round(remainingMsValue / 1000);
      setRemainingSec(remaining);
      setRemainingMs(remainingMsValue);

      if (remaining === 0) {
        if (phase === "work") {
          completedWorkSecRef.current += workSec;
          beep(660, 200);
          if (setIndex < totalSets) {
            if (restSec > 0) {
              armPhase("rest", setIndex, true);
            } else {
              armPhase("work", setIndex + 1, true);
            }
          } else {
            setPhase("done");
            setIsRunning(false);
            onFinish({ durationSecCompleted: completedWorkSecRef.current, setsCompleted: totalSets });
          }
        } else if (phase === "rest") {
          beep(880, 150);
          armPhase("work", setIndex + 1, true);
        }
        return; // the phase change above re-triggers this effect with fresh deps
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isRunning, phase, setIndex]);

  function handlePauseResume() {
    if (isRunning) {
      phaseEndRef.current = null;
      setIsRunning(false);
    } else {
      phaseEndRef.current = Date.now() + remainingMs;
      setIsRunning(true);
    }
  }

  function handleSkipRest() {
    armPhase("work", setIndex + 1, true);
  }

  function handleFinishNow() {
    // Mid-work: partial credit for time held this set. Mid-rest: that set's work
    // phase already finished, so setIndex already reflects sets completed either way.
    const elapsedThisPhase = phase === "work" ? workSec - remainingSec : 0;
    onFinish({
      durationSecCompleted: completedWorkSecRef.current + elapsedThisPhase,
      setsCompleted: setIndex,
    });
  }

  const phaseTotal = phase === "work" ? workSec : restSec;
  // Fraction of time remaining (not elapsed) — the ring should drain as the
  // countdown runs out, not fill up. Uses sub-second remainingMs (not the
  // rounded remainingSec used for the digits) so the ring animates smoothly
  // instead of jumping once per second.
  const percent = phaseTotal > 0 ? (remainingMs / (phaseTotal * 1000)) * 100 : 0;

  const label =
    phase === "rest"
      ? "Rest"
      : prescription.sets === undefined
        ? "Go"
        : totalSets > 1
          ? `Set ${setIndex} of ${totalSets}`
          : "Hold";

  return (
    <div className={`exercise-timer exercise-timer--${phase}`}>
      <FocusLabel text={label} variant={phase === "rest" ? "rest" : "primary"} />
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

      <div className="exercise-timer__controls">
        <button className="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button" onClick={handlePauseResume}>
          {isRunning ? "Pause" : "Resume"}
        </button>
        {phase === "rest" && (
          <button className="button" onClick={handleSkipRest}>
            Skip rest
          </button>
        )}
        <button className="button button--primary" onClick={handleFinishNow}>
          Finish now
        </button>
      </div>
    </div>
  );
}
