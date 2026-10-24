import { describe, expect, it } from 'vitest';
import { config } from '../src/engine/config';
import { evaluateTemplates } from '../src/ink/evaluate';
import type { Template } from '../src/ink/templates';

/**
 * Measures recogniser settings on her real handwriting. Runs only when pointed
 * at a file from Try it → Download handwriting data:
 *
 *   HANDWRITING_FILE=~/Downloads/mastermath-handwriting-2026-10-25.json npx vitest run tests/handwriting-report.test.ts
 *
 * The table is printed and also saved as <file>.report.txt.
 */
// No @types/node in this project (no new dependencies), so reach Node through globalThis.
const nodeProcess = (globalThis as unknown as { process?: { env: Record<string, string | undefined>; stdout: { write: (s: string) => void } } }).process;
const file = nodeProcess?.env.HANDWRITING_FILE;

describe.runIf(file)('handwriting report', () => {
  it('compares plain $P with direction-aware scoring, leave-one-out over her samples', async () => {
    // @ts-expect-error node:fs has no type declarations here; this file runs only under Vitest in Node.
    const { readFileSync, writeFileSync } = (await import('node:fs')) as {
      readFileSync: (p: string, enc: string) => string;
      writeFileSync: (p: string, data: string) => void;
    };
    const data = JSON.parse(readFileSync(file!, 'utf8')) as { format: string; templates: Template[] };
    expect(data.format).toBe('mastermath-handwriting-v1');
    const base = { n: config.ink.resamplePoints, minPathLength: config.ink.minInkPathLengthPx, confidentMarginRatio: config.ink.confidentMarginRatio };
    const lines = [`${data.templates.length} samples`];
    for (const w of [0, 0.25, 0.5, 1, 2]) {
      const r = evaluateTemplates(data.templates, { ...base, directionWeight: w });
      const conf = r.confusions.slice(0, 6).map((c) => `${c.prompt}→${c.read}×${c.count}`).join(' ');
      lines.push(`direction ${String(w).padEnd(4)} ${r.correct}/${r.total} (${r.accuracyPct}%)  ${conf}`);
    }
    // Also written beside the input, since Vitest may hide console output of passing tests.
    writeFileSync(`${file}.report.txt`, lines.join('\n') + '\n');
    nodeProcess?.stdout.write(lines.join('\n') + '\n');
  });
});
