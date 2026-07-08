/**
 * The one fixed place in the UI that always answers "what should I be doing
 * right now." Same typography, same position (top of whichever panel is
 * active, directly below the exercise card) across every state — ready to
 * start, mid-set, resting, wrapping up — so the user's eyes always know
 * where to look instead of hunting for the current instruction.
 */
export function FocusLabel({ text, variant = "primary" }: { text: string; variant?: "primary" | "rest" }) {
  return <p className={`focus-label ${variant === "rest" ? "focus-label--rest" : ""}`}>{text}</p>;
}
