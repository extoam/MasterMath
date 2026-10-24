/**
 * Page state machine for a worksheet: write, mark the whole page at once,
 * corrections round for the wrong items, repeat until clean. Pure functions
 * over plain records; the screen owns the recogniser and the clock.
 */

/** Typographic operators, as the child reads them. */
export type Op = '+' | '−' | '×' | '÷';

export interface Fact {
  op: Op;
  a: number;
  b: number;
  answer: number;
}
