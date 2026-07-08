import type { HistoryEntry } from "../api/types";

/**
 * Groups by the `date` field the backend already derived from each event's own
 * (completedAt, timezone) -- no client-side timezone math here. Entries arrive
 * most-recent-first, so a day separator is just "does this entry's date differ
 * from the previous one's."
 */
export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="status-message">No exercises logged yet.</p>;
  }

  return (
    <ul className="history-list">
      {entries.map((entry, i) => {
        const isNewDay = i === 0 || entry.date !== entries[i - 1]!.date;
        return (
          <li key={entry.eventId}>
            {isNewDay && <div className="history-list__day-separator">{entry.date}</div>}
            <div className="history-list__entry">
              {entry.icon && <span className="history-list__icon">{entry.icon}</span>}
              <span className="history-list__name">{entry.title}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
