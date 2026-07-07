import type { StateSummary as StateSummaryData } from "../api/types";

const READINESS_LABEL: Record<StateSummaryData["readiness"], string> = {
  green: "Ready",
  yellow: "Caution",
  red: "Back off",
};

const WARMTH_LABEL: Record<StateSummaryData["warmth"], string> = {
  cold: "Cold",
  slightly_warm: "Slightly warm",
  warm: "Warm",
  very_warm: "Very warm",
};

function formatCapability(id: string): string {
  return id.replace(/_/g, " ");
}

export function StateSummary({ summary }: { summary?: StateSummaryData }) {
  if (!summary) return null;

  return (
    <div className="state-summary">
      <span className={`chip chip--readiness-${summary.readiness}`}>{READINESS_LABEL[summary.readiness]}</span>
      <span className="chip">{WARMTH_LABEL[summary.warmth]}</span>
      {summary.limitingCapabilities.map((capability) => (
        <span className="chip chip--muted" key={capability}>
          {formatCapability(capability)}
        </span>
      ))}
    </div>
  );
}
