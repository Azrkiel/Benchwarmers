export type OverlaySide = 'left' | 'right';
export function panelBounds(width: number, height: number, side: OverlaySide) {
  const margin = width * .05;
  const panelWidth = Math.min(420, Math.max(260, width * .34));
  const y = Math.ceil(height * .18);
  const panelHeight = Math.floor(height * .65 - y - 8);
  if (panelWidth < 260 || panelHeight < 170) return undefined;
  return { x: side === 'left' ? margin : width - margin - panelWidth, y, width: panelWidth, height:panelHeight };
}
