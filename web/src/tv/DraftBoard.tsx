import { ROSTER_SIZE, type DraftBoardEntry, type PartyStateResponse } from '@shared/types';
import { Avatar, householdColor } from './avatar';

function memberAvatar(state: PartyStateResponse, memberId?: string): string {
  for (const h of state.households) {
    const m = h.members.find((x) => x.id === memberId);
    if (m) return m.avatar;
  }
  return '';
}

function Card({ e, state }: { e: DraftBoardEntry; state: PartyStateResponse }) {
  const owned = !!e.ownerMemberId;
  const color = householdColor(state.households, e.householdId);
  return (
    <div className={`tv-flip${owned ? ' is-drafted' : ''}`} data-testid="draft-card">
      <div className="tv-flip-inner">
        <div className="tv-flip-face tv-flip-front">
          <div className="tv-card-top">
            <span className="tv-jersey">#{e.player.number}</span>
            <span className="tv-pos">{e.player.position} · {e.teamShort}</span>
          </div>
          <div className="tv-nick">{e.player.nickname ?? e.player.name}</div>
          <div className="tv-pname">{e.player.name}</div>
          {e.scoutingNote ? <div className="tv-note">{e.scoutingNote}</div> : null}
        </div>
        <div className="tv-flip-face tv-flip-back" style={{ background: owned ? color : undefined }}>
          {owned ? (
            <>
              <div className="tv-back-top">#{e.player.number} {e.player.position} · {e.teamShort}</div>
              <div className="tv-back-nick">{e.player.nickname ?? e.player.name}</div>
              <div className="tv-back-owner">
                <Avatar avatar={memberAvatar(state, e.ownerMemberId)} name={e.ownerName ?? ''} color="#fff" size={44} />
                <span className="tv-owner">{e.ownerName}</span>
                <span className="tv-round">R{e.round}</span>
                {e.auto ? <span className="tv-auto">auto</span> : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
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
