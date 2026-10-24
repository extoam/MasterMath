import { blockFor, instructionFor, parseSheetCode } from '../curriculum/levelB';

interface Props {
  code: string;
  title: string;
  /** “Worksheet 3” or “Worksheet 3 · corrections”. */
  sheetLabel: string;
  /** Wall-clock ms the side was first opened: written into the Time field like on paper. */
  started: number;
}

const hm = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** The printed top of a sheet: code, title and instruction on the left, the Name/Date/Time block on the right. */
export function PaperHeader({ code, title, sheetLabel, started }: Props) {
  const { sheet } = parseSheetCode(code);
  const block = blockFor(sheet);
  const instruction = instructionFor(block);
  const [lo, hi] = block.sctMinutes;
  return (
    <header className="paper-head">
      <div className="paper-title">
        <span className="paper-code" data-testid="sheet-code">
          {code}
        </span>
        <span className="paper-topic">{title}</span>
        <span className="paper-instruction">◆ {instruction}</span>
      </div>
      <div className="paper-fields">
        <div className="field">
          <span>Name</span>
          <span className="line" />
        </div>
        <div className="field">
          <span>Date</span>
          <span className="line filled">{new Date(started).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        </div>
        <div className="field">
          <span>Time</span>
          <span className="line filled">{hm(started)} to</span>
        </div>
        <div className="paper-target" title="Kumon target time for one sheet, both sides">
          Target {lo}–{hi} min
        </div>
        <span className="paper-set" data-testid="worksheet-title">
          {sheetLabel}
        </span>
      </div>
    </header>
  );
}
