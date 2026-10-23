/**
 * Every tunable constant in ComeOnMath lives here. Nothing numeric is inlined
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
  },
} as const;
