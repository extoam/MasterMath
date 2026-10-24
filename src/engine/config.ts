/**
 * Every tunable constant in MasterMath lives here. Nothing numeric is inlined
 * where it is used. Later build steps add scheduler, session and assessment
 * sections beside `ink`.
 */
export const config = {
  ink: {
    /** Answer box size in CSS px. One box per digit. */
    boxWidthPx: 80,
    boxHeightPx: 100,
    strokeWidthPx: 3,
    /** Faint handwriting baseline, as a fraction of box height from the top. */
    baselineFraction: 0.8,
    /**
     * Pointer types that may draw inside an answer box. 'touch' is rejected so a
     * resting palm does not draw. 'mouse' is my call, not the spec's: it lets the
     * app be driven on a desktop during development.
     */
    acceptedPointerTypes: ['pen', 'mouse'] as readonly string[],
    /** $P resamples every digit to this many points. */
    resamplePoints: 32,
    /** Ink with less total path length than this is treated as nothing written. */
    minInkPathLengthPx: 8,
    /** runnerUpScore / bestScore must reach this for a match to count as confident. */
    confidentMarginRatio: 1.2,
    /** Active template set per digit (newest kept). Stored rows are never deleted. */
    maxTemplatesPerDigit: 10,
    /** The handwriting check refuses to start below this many templates for any digit. */
    minTemplatesPerDigit: 3,
    /** One calibration run asks for each digit this many times. */
    calibrationRepsPerDigit: 3,
    /** The handwriting check prompts each digit this many times (10 → 100 items). */
    checkItemsPerDigit: 10,
    /** Rubber: a completed stroke within this many CSS px of the pen is removed. */
    eraserRadiusPx: 12,
  },
  worksheet: {
    itemsPerPage: 10,
    /** Active time pauses after this long without a pointer event. */
    idleTimeoutMs: 30_000,
    /**
     * Live active-time display in the top-right corner of the worksheet. The
     * spec says no visible timer; the user asked for one on 2026-10-24, like
     * the Kumon Connect app. Flip this to go back to the spec.
     */
    showTimer: true as boolean,
    /** How often the visible timer re-reads the clock. */
    timerTickMs: 500,
    /** After marking, the button that appears where Submit was ignores taps for this long, so a double-tap cannot skip the marked page. */
    secondTapGuardMs: 600,
  },
  sheet: {
    /** Problems on one side of a column sheet (2 columns of 5). Never more than 2 columns. */
    columnProblems: 10,
    /** Problems on one side of a horizontal sheet (2 columns of 10). */
    horizontalProblems: 20,
    /** Answer box size on a horizontal side, CSS px; smaller than the calibration box so 10 rows fit. */
    horizontalBoxPx: { w: 54, h: 66 },
    /** Answer box size on a column side, CSS px. */
    columnBoxPx: { w: 50, h: 62 },
  },
  daily: {
    /** Kumon sheet numbers in one day's set; each has an a and a b side. */
    sheets: 10,
  },
  progress: {
    /** Where she starts: she passed B100 on paper; her last sheet was subtraction up to 20. */
    startSheet: 101,
    /** A block passes when first-pass accuracy over the attempt reaches this… */
    passAccuracy: 0.9,
    /** …and the median side takes no longer than half the block's upper SCT (SCT is per two-sided sheet). */
    sctSideFraction: 0.5,
    /**
     * Problems slower than this to first stroke count as not yet fluent and
     * come back for review. Column problems get longer: she works the carry or
     * borrow before writing.
     */
    fluencyMs: { horizontal: 3_000, column: 6_000 },
    /** Right-and-fast answers in a row that take a problem out of review. */
    reviewClearStreak: 2,
    /** Distinct review problems swapped into a side (each shown twice). */
    reviewPerSide: 2,
  },
} as const;
