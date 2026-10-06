import type { CSSProperties } from "react";

// Parses standard ANSI SGR escape sequences (\x1b[...m) — the same codes
// restart_server.sh's FORCE_COLOR=1 + uvicorn --use-colors write straight
// into server.log — into styled tokens the Logs page renders as spans,
// so the page shows the same colors/weights a real terminal would instead
// of the raw escape bytes. Truecolor/256-color sequences (38;2;.../38;5;...)
// are recognized just enough to be skipped correctly (so their parameter
// bytes aren't misread as unrelated codes); they don't map to a specific
// rendered color since this UI only defines the standard 16-color palette.

export interface AnsiToken {
  text: string;
  style: CSSProperties;
}

interface AnsiState {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  reverse: boolean;
}

const DEFAULT_STATE: AnsiState = {
  fg: null,
  bg: null,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  reverse: false,
};

const ANSI_COLOR_NAMES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

function colorVar(index: number, bright: boolean): string {
  return `--jv-term-ansi-${bright ? "bright-" : ""}${ANSI_COLOR_NAMES[index]}`;
}

function applyCode(state: AnsiState, code: number): void {
  if (code === 0) Object.assign(state, DEFAULT_STATE);
  else if (code === 1) state.bold = true;
  else if (code === 2) state.dim = true;
  else if (code === 3) state.italic = true;
  else if (code === 4) state.underline = true;
  else if (code === 7) state.reverse = true;
  else if (code === 22) { state.bold = false; state.dim = false; }
  else if (code === 23) state.italic = false;
  else if (code === 24) state.underline = false;
  else if (code === 27) state.reverse = false;
  else if (code === 39) state.fg = null;
  else if (code === 49) state.bg = null;
  else if (code >= 30 && code <= 37) state.fg = colorVar(code - 30, false);
  else if (code >= 90 && code <= 97) state.fg = colorVar(code - 90, true);
  else if (code >= 40 && code <= 47) state.bg = colorVar(code - 40, false);
  else if (code >= 100 && code <= 107) state.bg = colorVar(code - 100, true);
  // Anything else (blink, strikethrough, etc.) has no visual mapping here
  // and is silently ignored rather than left to fall through incorrectly.
}

function applyCodes(state: AnsiState, codes: number[]): AnsiState {
  const next = { ...state };
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    if (code === 38 || code === 48) {
      // Extended color: `38;5;N` (256-color) or `38;2;R;G;B` (truecolor).
      // Not rendered (only the standard 16-color palette is themed), but
      // its parameter bytes must still be consumed here so they aren't
      // misinterpreted as separate, unrelated SGR codes on the next loop.
      const mode = codes[i + 1];
      if (mode === 5) i += 2;
      else if (mode === 2) i += 4;
      else i += 1;
      continue;
    }
    applyCode(next, code);
  }
  return next;
}

function stateToStyle(state: AnsiState): CSSProperties {
  const fg = state.fg ? `var(${state.fg})` : undefined;
  const bg = state.bg ? `var(${state.bg})` : undefined;
  return {
    color: state.reverse ? bg ?? "var(--jv-term-bg)" : fg,
    backgroundColor: state.reverse ? fg ?? "var(--jv-term-text)" : bg,
    fontWeight: state.bold ? 700 : undefined,
    opacity: state.dim ? 0.65 : undefined,
    fontStyle: state.italic ? "italic" : undefined,
    textDecoration: state.underline ? "underline" : undefined,
  };
}

const SGR_RE = /\x1b\[([0-9;]*)m/g;

export function parseAnsiLine(line: string): AnsiToken[] {
  const tokens: AnsiToken[] = [];
  let state: AnsiState = { ...DEFAULT_STATE };
  let lastIndex = 0;

  function pushText(text: string) {
    if (text) tokens.push({ text, style: stateToStyle(state) });
  }

  SGR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SGR_RE.exec(line)) !== null) {
    pushText(line.slice(lastIndex, match.index));
    lastIndex = SGR_RE.lastIndex;
    const codes = match[1].length ? match[1].split(";").map(Number) : [0];
    state = applyCodes(state, codes);
  }
  pushText(line.slice(lastIndex));
  return tokens;
}
