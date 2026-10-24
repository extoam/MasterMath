import { config } from '../engine/config';

/**
 * Box and digit size for a row of `rowPx` CSS px. Default sizes when the row
 * is tall enough; smaller, down to a floor, when it is not. Recognition is
 * scale-free, so smaller boxes still read.
 */
export function fitToRow(layout: 'horizontal' | 'column', rowPx: number | null): { box: { w: number; h: number }; font: number } {
  const base = layout === 'column' ? config.sheet.columnBoxPx : config.sheet.horizontalBoxPx;
  const ratio = base.w / base.h;
  // A column problem stacks two number lines (~1.15 box heights), a rule and the boxes.
  const h =
    rowPx === null
      ? base.h
      : layout === 'column'
        ? Math.max(config.sheet.minBoxPx, Math.min(base.h, Math.floor((rowPx - 24) / 2.15)))
        : Math.max(config.sheet.minBoxPx, Math.min(base.h, Math.floor(rowPx - 12)));
  return { box: { w: Math.round(h * ratio), h }, font: Math.round(h * 0.52) };
}
