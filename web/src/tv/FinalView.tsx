import type { PartyStateResponse, SeasonResponse } from '@shared/types';

export function FinalView(_props: { state: PartyStateResponse; serverNow: () => number; season?: SeasonResponse }) {
  return <section className="tv-view tv-final">Final</section>;
}
