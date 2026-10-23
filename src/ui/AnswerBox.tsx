import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { config } from '../engine/config';
import { StrokeRecorder, attachPointerCapture } from '../ink/capture';
import type { Stroke } from '../ink/types';
import './AnswerBox.css';

export interface AnswerBoxHandle {
  clear(): void;
  /** Completed strokes, copied. */
  strokes(): Stroke[];
  firstStrokeAt(): number | null;
}

export interface AnswerBoxProps {
  /** Fires when the set of completed strokes changes (pen-up, cancel, clear), not mid-stroke. */
  onInkChange?: (strokes: Stroke[]) => void;
  disabled?: boolean;
}

/** One digit box: a canvas with a faint baseline, stylus ink, palm rejected. */
export const AnswerBox = forwardRef<AnswerBoxHandle, AnswerBoxProps>(function AnswerBox(
  { onInkChange, disabled = false },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<StrokeRecorder | null>(null);
  const onInkChangeRef = useRef(onInkChange);
  onInkChangeRef.current = onInkChange;

  if (!recorderRef.current) {
    const recorder = new StrokeRecorder({
      acceptedPointerTypes: config.ink.acceptedPointerTypes,
      onChange: (strokes) => {
        draw(canvasRef.current, strokes);
        if (recorder.current === null) onInkChangeRef.current?.(recorder.strokes.map(copyStroke));
      },
    });
    recorderRef.current = recorder;
  }

  useEffect(() => {
    draw(canvasRef.current, recorderRef.current!.allStrokes());
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || disabled) return;
    return attachPointerCapture(canvas, recorderRef.current!);
  }, [disabled]);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => recorderRef.current!.clear(),
      strokes: () => recorderRef.current!.strokes.map(copyStroke),
      firstStrokeAt: () => recorderRef.current!.firstStrokeAt,
    }),
    [],
  );

  const { boxWidthPx: w, boxHeightPx: h } = config.ink;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return (
    <canvas
      ref={canvasRef}
      className="answer-box"
      width={Math.round(w * dpr)}
      height={Math.round(h * dpr)}
      data-disabled={disabled ? 'true' : 'false'}
      aria-label="Answer box"
    />
  );
});

function copyStroke(s: Stroke): Stroke {
  return s.map((p) => ({ ...p }));
}

function draw(canvas: HTMLCanvasElement | null, strokes: Stroke[]): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { boxWidthPx: w, boxHeightPx: h, strokeWidthPx, baselineFraction } = config.ink;
  const dpr = canvas.width / w;
  const styles = getComputedStyle(canvas);
  const ruleColour = styles.getPropertyValue('--rule-faint').trim() || '#ebe7dc';
  const inkColour = styles.getPropertyValue('--ink').trim() || '#1b1b1b';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.lineWidth = 1;
  ctx.strokeStyle = ruleColour;
  ctx.beginPath();
  ctx.moveTo(6, h * baselineFraction);
  ctx.lineTo(w - 6, h * baselineFraction);
  ctx.stroke();

  ctx.lineWidth = strokeWidthPx;
  ctx.strokeStyle = inkColour;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    const first = stroke[0];
    if (!first) continue;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    if (stroke.length === 1) ctx.lineTo(first.x + 0.01, first.y);
    for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i]!.x, stroke[i]!.y);
    ctx.stroke();
  }
}
