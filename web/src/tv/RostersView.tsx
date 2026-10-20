import type { PartyStateResponse } from '@shared/types';

export function RostersView(_props: { state: PartyStateResponse; serverNow: () => number }) {
  return <section className="tv-view tv-rosters">Rosters</section>;
}
