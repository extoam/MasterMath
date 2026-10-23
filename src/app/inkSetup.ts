import { config } from '../engine/config';
import type { RecogniserOptions } from '../ink/recogniser';
import { TemplateStore } from '../ink/templates';

/** Maps config to the ink modules' own option shapes, so ink/ never imports config. */
export const recogniserOptions: RecogniserOptions = {
  n: config.ink.resamplePoints,
  minPathLength: config.ink.minInkPathLengthPx,
  confidentMarginRatio: config.ink.confidentMarginRatio,
};

export function createTemplateStore(): TemplateStore {
  return new TemplateStore({
    maxPerDigit: config.ink.maxTemplatesPerDigit,
    minPerDigit: config.ink.minTemplatesPerDigit,
    n: config.ink.resamplePoints,
  });
}
