import type { ToolCallTrace } from '@shared/types';

export function TracePanel({ calls }: { calls: ToolCallTrace[] }) {
  if (calls.length === 0) return <p className="trace-empty">No tool calls yet</p>;
  return (
    <ol className="trace-list" data-testid="trace-list">
      {calls.map((c, i) => (
        <li key={`${c.name}-${i}`} className="trace-item" data-testid="trace-item">
          <div className="trace-head">
            <code className="trace-name">{c.name}</code>
            <span className={`trace-ok ${c.ok ? 'is-ok' : 'is-bad'}`} title={c.ok ? 'ok' : 'failed'}>
              {c.ok ? '✓' : '✗'}
            </span>
            <span className="trace-ms">{c.ms} ms</span>
          </div>
          <p className="trace-summary">{c.summary}</p>
          <pre className="trace-args">{JSON.stringify(c.args)}</pre>
        </li>
      ))}
    </ol>
  );
}
