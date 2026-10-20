import type { PartyStateResponse } from '@shared/types';

export function LiveView(_props: { state: PartyStateResponse; serverNow: () => number }) {
  return <section className="tv-view tv-live">Live</section>;
}
