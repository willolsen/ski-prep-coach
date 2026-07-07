import type { TodayProgress as TodayProgressData } from "../api/types";

export function TodayProgress({ progress }: { progress: TodayProgressData }) {
  const percent = Math.min(100, Math.max(0, progress.percentComplete));

  return (
    <div className="today-progress">
      <div className="today-progress__header">
        <span>Today</span>
        <span>
          {progress.stimulusScore} / {progress.targetStimulusScore}
          {progress.status === "complete" ? " · done for today" : ""}
        </span>
      </div>
      <div className="progress-bar">
        <div className="progress-bar__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
