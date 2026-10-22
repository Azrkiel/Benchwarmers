import { ROSTER_SIZE, type DraftBoardEntry, type PartyStateResponse } from '@shared/types';
import { Avatar, householdColor } from './avatar';

function Card({ e, state }: { e: DraftBoardEntry; state: PartyStateResponse }) {
  const owned = !!e.ownerMemberId;
  const color = householdColor(state.households, e.householdId);
  return (
    <article className={`tv-draft-card${owned ? ' is-drafted' : ''}`} data-testid="draft-card" style={{ ['--owner' as string]: color }}>
      <span className="tv-jersey">{String(e.player.number).padStart(2, '0')}</span>
      <div className="tv-card-info">
        <div className="tv-nick">{e.player.nickname ?? e.player.name}</div>
        <div className="tv-pname">{e.player.name}</div>
      </div>
      <div className="tv-card-status">
        <span className={owned ? 'tv-owner' : 'tv-available'}>{owned ? `${e.ownerName} · R${e.round}${e.auto ? ' · auto' : ''}` : 'Available'}</span>
        <span className="tv-pos">{e.player.position}</span>
      </div>
    </article>
  );
}

export function DraftBoard({ state }: { state: PartyStateResponse; serverNow?: () => number }) {
  const picks = state.draftBoard.filter((e) => e.ownerMemberId).length;
  const members = state.households.flatMap((h) => h.members.map((m) => ({ ...m, color: h.color })));
  const counts = new Map<string, number>();
  for (const e of state.draftBoard) if (e.ownerMemberId) counts.set(e.ownerMemberId, (counts.get(e.ownerMemberId) ?? 0) + 1);
  const onClock = members.filter((m) => (counts.get(m.id) ?? 0) < ROSTER_SIZE);
  const totalSlots = members.length * ROSTER_SIZE;
  const side = (s: 'home' | 'away') => state.draftBoard.filter((e) => e.side === s);

  return (
    <section className="tv-view tv-draft">
      <header className="tv-draft-head">
        <h1 className="tv-title">Draft night</h1>
        <div className="tv-sub">{state.game.title}</div>
        <div className="tv-count">{picks} of {totalSlots} picks made</div>
      </header>
      <div className="tv-clock-banner">
        <span className="tv-clock-label">On the clock</span>
        {onClock.length === 0 ? <span className="tv-clock-done">Rosters set</span> : null}
        {onClock.map((m) => (
          <span className="tv-clock-member" key={m.id} data-testid="on-clock">
            <Avatar avatar={m.avatar} name={m.name} color={m.color} size={48} />
            <span>{m.name}</span>
          </span>
        ))}
      </div>
      <div className="tv-teams">
        {(['home', 'away'] as const).map((s) => {
          const t = s === 'home' ? state.game.home : state.game.away;
          return (
            <div className="tv-team" key={s} style={{ ['--team' as string]: t.color }}>
              <h2 className="tv-team-name">{t.name}</h2>
              <div className="tv-grid">
                {side(s).map((e) => <Card key={e.player.id} e={e} state={state} />)}
              </div>
            </div>
          );
        })}
      </div>
      <footer className="tv-legend">
        {state.households.map((h) => (
          <span className="tv-legend-item" key={h.id}>
            <i className="tv-swatch" style={{ background: h.color }} />
            {h.name} <span className="tv-muted">{h.city}</span>
          </span>
        ))}
      </footer>
    </section>
  );
}
