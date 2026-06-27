// Cosmetic wire colours. Colour is a visual label only — it never affects
// electrical connectivity. Signal state is shown via brightness: `on` when the
// wire carries 1, the dimmer `off` when it carries 0 (still hued, so you can
// trace a wire even when it's low).

export interface WireColor {
  name: string;
  on: string;
  off: string;
}

export const WIRE_COLORS: WireColor[] = [
  { name: '绿', on: '#39d353', off: '#1d5a30' },
  { name: '红', on: '#ff6b6b', off: '#6e2b2b' },
  { name: '蓝', on: '#5ca8ff', off: '#264c70' },
  { name: '黄', on: '#ffd33d', off: '#6e5b1c' },
  { name: '紫', on: '#b388ff', off: '#46306e' },
  { name: '青', on: '#3ddbd9', off: '#1c5a59' },
  { name: '橙', on: '#ff9f43', off: '#6e4423' },
  { name: '白', on: '#e6edf3', off: '#48525c' },
];

export function wireColor(index: number | undefined): WireColor {
  return WIRE_COLORS[index ?? 0] ?? WIRE_COLORS[0];
}
