/**
 * Dev-only control for simulating elapsed time without waiting for it, in the
 * same spirit as the server's own explicit-`now` design
 * (docs/spec/11-core-principle.md). Purely presentational -- AppShell owns the
 * offset and passes down the already-computed simulated clock plus a callback,
 * same pattern as every other component here.
 */
export function TimeTravelBar({
  simulatedNow,
  onAdvance,
}: {
  simulatedNow: Date;
  onAdvance: (deltaMs: number) => void;
}) {
  return (
    <div className="time-travel-bar">
      <span className="time-travel-bar__clock">{simulatedNow.toLocaleString()}</span>
      <button type="button" className="button" onClick={() => onAdvance(30_000)}>
        +30s
      </button>
      <button type="button" className="button" onClick={() => onAdvance(3_600_000)}>
        +1h
      </button>
    </div>
  );
}
