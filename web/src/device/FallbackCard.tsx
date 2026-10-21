import type { DraftBoardEntry, Household, PartyStateResponse, SeasonResponse } from '@shared/types';
import './fallback.css';
import type { FallbackModel } from './fallbackModel';

const HEX = /^#[0-9a-fA-F]{6}$/;

function colorOf(households: Household[] | undefined, id: string | undefined): string | undefined {
  const c = households?.find((h) => h.id === id)?.color;
  return c && HEX.test(c) ? c : undefined;
}

function Dot({ color }: { color?: string }) {
  return <span className="fb-dot" aria-hidden="true" style={color ? { background: color } : undefined} />;
}

function line(e: DraftBoardEntry, withRound: boolean): string {
  const parts = [e.player.name, e.player.position, e.teamShort];
  if (withRound && e.round) parts.push(`R${e.round}`);
  return parts.join(' · ');
}

const isOwned = (e: DraftBoardEntry) => Boolean(e.ownerMemberId || e.ownerName);

function Draft({ state, code }: { state: PartyStateResponse; code?: string }) {
  const groups = new Map<string, { owner: string; householdId?: string; items: DraftBoardEntry[] }>();
  for (const e of state.draftBoard.filter(isOwned)) {
    const owner = e.ownerName ?? e.ownerMemberId ?? 'Unknown';
    const g = groups.get(owner) ?? { owner, householdId: e.householdId, items: [] };
    g.items.push(e);
    groups.set(owner, g);
  }
  const available = state.draftBoard
    .filter((e) => !isOwned(e))
    .sort((a, b) => b.points - a.points || a.player.name.localeCompare(b.player.name))
    .slice(0, 8);
  return (
    <>
      <header className="fb-head">
        <h2>Draft board</h2>
        <p className="fb-sub">
          {[code ?? state.party.code, state.party.crewName, state.game.title].filter(Boolean).join(' · ')}
        </p>
      </header>
      {groups.size === 0 ? <p className="fb-muted">No picks yet.</p> : null}
      {[...groups.values()].map((g) => (
        <div className="fb-group" key={g.owner}>
          <h3>
            <Dot color={colorOf(state.households, g.householdId)} />
            {g.owner}
          </h3>
          <ul className="fb-list">
            {g.items.map((e) => (
              <li key={e.player.id} data-testid={`drafted-${e.player.id}`} aria-label={`${g.owner}: ${line(e, true)}`}>
                <span>{line(e, true)}</span>
                {e.auto ? <span className="fb-tag">auto</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <h3 className="fb-section">Top available</h3>
      {available.length === 0 ? (
        <p className="fb-muted">Nobody left on the board.</p>
      ) : (
        <ul className="fb-list" data-testid="top-available">
          {available.map((e) => (
            <li key={e.player.id}>{line(e, false)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function Tonight({ state, householdId }: { state: PartyStateResponse; householdId?: string }) {
  const { away, home, clock } = state.game;
  return (
    <>
      <header className="fb-head">
        <h2>Tonight</h2>
        <p className="fb-score">
          {away.short} {away.score} – {home.score} {home.short}
          <span className="fb-clock">{clock}</span>
        </p>
      </header>
      <table className="fb-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Household</th>
            <th>Total</th>
            <th>Streak</th>
          </tr>
        </thead>
        <tbody>
          {state.standings.map((r) => (
            <tr key={r.memberId} className={householdId && r.householdId === householdId ? 'fb-mine' : undefined}>
              <td>{r.rank}</td>
              <td>{r.name}</td>
              <td>
                <Dot color={colorOf(state.households, r.householdId)} />
                {r.household}
              </td>
              <td>{r.total}</td>
              <td>{r.streak}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.activeProp ? (
        <p className="fb-prop">
          <span className="fb-tag">Live question</span> {state.activeProp.question}
        </p>
      ) : null}
    </>
  );
}

function Season({ season, householdId }: { season: SeasonResponse; householdId?: string }) {
  return (
    <>
      <header className="fb-head">
        <h2>Season standings</h2>
        <p className="fb-sub">{season.crew?.name}</p>
      </header>
      <table className="fb-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Household</th>
            <th>Points</th>
            <th>Nights won</th>
            <th>Correct</th>
          </tr>
        </thead>
        <tbody>
          {season.rows.map((r) => (
            <tr key={r.memberId} className={householdId && r.householdId === householdId ? 'fb-mine' : undefined}>
              <td>{r.rank}</td>
              <td>{r.name}</td>
              <td>
                <Dot color={colorOf(season.households, r.householdId)} />
                {r.household}
              </td>
              <td>{r.points}</td>
              <td>{r.nightsWon}</td>
              <td>
                {r.correct}/{r.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function FallbackCard({ model, householdId }: { model: FallbackModel | undefined; householdId?: string }) {
  if (!model) {
    return (
      <section className="fb-card" data-view="empty" aria-label="Party board">
        <p className="fb-empty">Ask “who's available?” to bring up the draft board.</p>
      </section>
    );
  }
  return (
    <section className="fb-card" data-view={model.view} aria-label="Party board">
      {model.view === 'draft' && model.state ? <Draft state={model.state} code={model.code} /> : null}
      {model.view === 'tonight' && model.state ? <Tonight state={model.state} householdId={householdId} /> : null}
      {model.view === 'season' && model.season ? <Season season={model.season} householdId={householdId} /> : null}
    </section>
  );
}
