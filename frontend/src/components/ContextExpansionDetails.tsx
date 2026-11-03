import type { ContextExpansionResult } from "../types/api.generated";

// Developer view of one expansion: what each channel searched, returned and cost, and why each source was picked.
export function ContextExpansionDetails({ expansion }: { expansion: ContextExpansionResult }) {
  return (
    <div className="grid gap-3 text-caption">
      <p className="text-mute">
        {expansion.candidate_count} kandydatów po deduplikacji · {expansion.duration_ms} ms ·{" "}
        {expansion.usage.total_tokens} tokenów (zapytania i wybór)
      </p>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th>kanał</th>
            <th>zapytania</th>
            <th>wyniki</th>
            <th>ms</th>
            <th>USD</th>
            <th>błąd</th>
          </tr>
        </thead>
        <tbody>
          {expansion.channels.map((channel) => (
            <tr key={channel.channel} className="align-top">
              <td>{channel.channel}</td>
              <td>{channel.queries.join(" | ")}</td>
              <td>{channel.result_count}</td>
              <td>{channel.duration_ms}</td>
              <td>{channel.cost_usd ?? "—"}</td>
              <td>{channel.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="grid gap-2">
        {expansion.selected.map((source, index) => (
          <li key={source.url}>
            [{index + 1}] {source.channel} ·{" "}
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">
              {source.title ?? source.url}
            </a>
            <span className="block text-mute">{source.selection_reason}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
