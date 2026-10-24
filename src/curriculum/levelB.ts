import type { Fact, Layout } from '../engine/worksheet';

/**
 * Kumon Level B, sheets 1–200, as 20 blocks of 10. Titles and standard
 * completion times (SCT, minutes per two-sided sheet, corrections included)
 * follow Kumon’s published Table of Learning Materials. The problem rules are
 * our reading of each title; Kumon’s exact problems are not public.
 */
export interface Block {
  first: number;
  last: number;
  title: string;
  layout: Layout;
  /** Minutes per sheet (both sides), corrections included. */
  sctMinutes: readonly [number, number];
  generate: (random: () => number) => Fact;
}

export type Side = 'a' | 'b';

const int = (random: () => number, lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
const add = (a: number, b: number): Fact => ({ op: '+', a, b, answer: a + b });
const sub = (a: number, b: number): Fact => ({ op: '−', a, b, answer: a - b });

/** Draw until `ok` holds. Every rule below is satisfiable, so this terminates quickly. */
function until(random: () => number, make: (r: () => number) => Fact, ok: (f: Fact) => boolean): Fact {
  for (;;) {
    const f = make(random);
    if (ok(f)) return f;
  }
}

const ones = (n: number) => n % 10;
const tens = (n: number) => Math.floor(n / 10) % 10;
const two = (r: () => number) => int(r, 10, 99);
const three = (r: () => number) => int(r, 100, 999);

type Spec = [title: string, layout: Layout, sct: [number, number], generate: (r: () => number) => Fact];

const SPECS: Spec[] = [
  ['Addition (Review up to A)', 'horizontal', [1, 2], (r) => until(r, (r) => add(int(r, 1, 19), int(r, 1, 9)), (f) => f.answer <= 28)],
  ['Addition to 100 Part 1', 'column', [1, 2], (r) => until(r, (r) => add(two(r), int(r, 1, 9)), (f) => ones(f.a) + f.b < 10)],
  ['Addition to 100 Part 2', 'column', [2, 3], (r) => until(r, (r) => add(two(r), int(r, 1, 9)), (f) => ones(f.a) + f.b === 10 && f.answer <= 100)],
  ['Addition to 100 Part 3', 'column', [2, 3], (r) => until(r, (r) => add(two(r), int(r, 2, 9)), (f) => ones(f.a) + f.b > 10 && f.answer < 100)],
  ['Addition of 2-Digit Numbers 1', 'column', [2, 3], (r) => until(r, (r) => add(two(r), two(r)), (f) => ones(f.a) + ones(f.b) < 10 && tens(f.a) + tens(f.b) < 10)],
  ['Addition of 2-Digit Numbers 2', 'column', [2, 3], (r) => until(r, (r) => add(two(r), two(r)), (f) => ones(f.a) + ones(f.b) >= 10 && f.answer < 100)],
  ['Addition of 2-Digit Numbers 3', 'column', [2, 3], (r) => until(r, (r) => add(two(r), two(r)), (f) => f.answer >= 100)],
  ['Addition of 3-Digit Numbers 1', 'column', [2, 4], (r) => until(r, (r) => add(three(r), int(r, 2, 99)), (f) => ones(f.a) + ones(f.b) >= 10 && f.answer < 1000)],
  ['Addition of 3-Digit Numbers 2', 'column', [2, 4], (r) => until(r, (r) => add(three(r), three(r)), (f) => f.answer < 1000)],
  ['Addition of 3-Digit Numbers 3', 'column', [3, 5], (r) => until(r, (r) => add(three(r), three(r)), (f) => f.answer >= 1000)],
  ['Subtraction 1 (Review up to A)', 'horizontal', [1, 2], (r) => until(r, (r) => sub(int(r, 2, 12), int(r, 1, 9)), (f) => f.answer >= 0)],
  ['Subtraction 2 (Review up to A)', 'horizontal', [2, 3], (r) => until(r, (r) => sub(int(r, 10, 20), int(r, 1, 9)), (f) => f.answer >= 0)],
  ['Subtraction of 2-Digit Numbers 1', 'column', [2, 3], (r) => sub(two(r), int(r, 1, 9))],
  ['Subtraction of 2-Digit Numbers 2', 'column', [2, 3], (r) => until(r, (r) => sub(two(r), two(r)), (f) => ones(f.a) >= ones(f.b) && f.answer >= 0)],
  ['Subtraction of 2-Digit Numbers 3', 'column', [2, 3], (r) => until(r, (r) => sub(two(r), two(r)), (f) => ones(f.a) < ones(f.b) && f.answer >= 0)],
  ['Addition and Subtraction of 2-Digit Numbers', 'column', [2, 4], (r) =>
    r() < 0.5 ? until(r, (r) => add(two(r), two(r)), () => true) : until(r, (r) => sub(two(r), two(r)), (f) => f.answer >= 0)],
  ['Subtraction of 3-Digit Numbers 1', 'column', [2, 3], (r) => until(r, (r) => sub(three(r), int(r, 1, 99)), (f) => f.answer >= 0)],
  ['Subtraction of 3-Digit Numbers 2', 'column', [2, 4], (r) =>
    until(r, (r) => sub(three(r), two(r)), (f) => (ones(f.a) < ones(f.b) || tens(f.a) < tens(f.b)) && f.answer >= 0)],
  ['Subtraction of 3-Digit Numbers 3', 'column', [2, 4], (r) => until(r, (r) => sub(three(r), three(r)), (f) => f.answer >= 0)],
  // A zero in the tens, so the borrow has to cross it: 403 − 27.
  ['Subtraction of 3-Digit Numbers 4', 'column', [3, 5], (r) =>
    until(r, (r) => sub(int(r, 1, 9) * 100 + int(r, 0, 8), int(r, 2, 99)), (f) => ones(f.a) < ones(f.b) && f.answer >= 0)],
];

export const LEVEL_B: readonly Block[] = SPECS.map(([title, layout, sctMinutes, generate], i) => ({
  first: i * 10 + 1,
  last: i * 10 + 10,
  title,
  layout,
  sctMinutes,
  generate,
}));

export const FIRST_SHEET = 1;
export const LAST_SHEET = 200;

export function blockFor(sheet: number): Block {
  const block = LEVEL_B[Math.floor((sheet - 1) / 10)];
  if (!block || sheet < FIRST_SHEET || sheet > LAST_SHEET) throw new Error(`No Level B sheet ${sheet}`);
  return block;
}

export function sheetCode(sheet: number, side: Side): string {
  return `B${sheet}${side}`;
}

export function parseSheetCode(code: string): { sheet: number; side: Side } {
  const m = /^B(\d{1,3})([ab])$/.exec(code);
  const sheet = m ? Number(m[1]) : NaN;
  if (!m || sheet < FIRST_SHEET || sheet > LAST_SHEET) throw new Error(`Not a Level B sheet code: ${code}`);
  return { sheet, side: m[2] as Side };
}
