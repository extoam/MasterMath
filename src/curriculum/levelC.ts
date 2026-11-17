/**
 * Level C as a preview: the 20 blocks after Level B, with Kumon's titles and
 * target times (minutes per two-sided sheet) from the published Table of
 * Learning Materials. Shown in the Parent view as what comes next; it has no
 * problem generators yet, so the app cannot serve Level C sheets.
 */
export const LEVEL_C_PREVIEW: ReadonlyArray<{ sheets: string; title: string; sctMinutes: readonly [number, number] }> = [
  ['Review up to B', 2, 3],
  ['Multiplication up to 3', 2, 3],
  ['Multiplication up to 5', 2, 3],
  ['Multiplication up to 7', 2, 3],
  ['Multiplication up to 9', 2, 3],
  ['Multiplication: 2 Digits × 1 Digit 1', 2, 4],
  ['Multiplication: 2 Digits × 1 Digit 2', 2, 4],
  ['Multiplication: 2 Digits × 1 Digit 3', 2, 4],
  ['Multiplication: 2 Digits × 1 Digit 4', 2, 4],
  ['Multiplication: 2 Digits × 1 Digit 5', 2, 4],
  ['Multiplication: 3 or 4 Digits × 1 Digit', 3, 5],
  ['Introduction to Division', 2, 3],
  ['Division with Remainders 1', 2, 3],
  ['Division with Remainders 2', 2, 3],
  ['Division with Remainders 3', 2, 3],
  ['Division with Remainders 4', 2, 3],
  ['Division: 2 Digits ÷ 1 Digit 1', 2, 3],
  ['Division: 2 Digits ÷ 1 Digit 2', 2, 3],
  ['Division: 3 Digits ÷ 1 Digit 1', 3, 4],
  ['Division: 3 Digits ÷ 1 Digit 2', 3, 5],
].map(([title, lo, hi], i) => ({ sheets: `C${i * 10 + 1}–${i * 10 + 10}`, title: title as string, sctMinutes: [lo as number, hi as number] as const }));
