import { useCallback, useRef, useState, type ReactNode } from "react";

import "./ChartTooltip.scss";

interface TipState {
  x: number;
  y: number;
  below: boolean;
  content: ReactNode;
}

const TIP_HALF_WIDTH = 96;
const FLIP_BELOW_WITHIN = 72;

// Anchors one tooltip to whichever mark is hovered or focused, clamped inside the wrapper.
export function useChartTooltip() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  const show = useCallback((el: Element, content: ReactNode) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const w = wrap.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const center = r.left - w.left + r.width / 2;
    const x = Math.min(Math.max(center, TIP_HALF_WIDTH), Math.max(w.width - TIP_HALF_WIDTH, TIP_HALF_WIDTH));
    const below = r.top - w.top < FLIP_BELOW_WITHIN;
    setTip({ x, y: below ? r.bottom - w.top : r.top - w.top, below, content });
  }, []);

  const hide = useCallback(() => setTip(null), []);

  const node = tip ? (
    <div
      className={`wi-tip${tip.below ? " wi-tip--below" : ""}`}
      style={{ left: tip.x, top: tip.y }}
      role="tooltip"
    >
      {tip.content}
    </div>
  ) : null;

  return { wrapRef, show, hide, node };
}

export function TipTitle({ children }: { children: ReactNode }) {
  return <div className="wi-tip-title">{children}</div>;
}

export function TipLine({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="wi-tip-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
