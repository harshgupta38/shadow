interface SparkbarProps {
  values: number[];
  /** Highlight the final bar (e.g. "today"). */
  highlightLast?: boolean;
  /** Override the max used to scale bar heights. */
  max?: number;
  height?: number;
}

/** A tiny dependency-free bar chart for showing recent activity trends. */
export function Sparkbar({ values, highlightLast = true, max, height = 46 }: SparkbarProps) {
  const peak = Math.max(max ?? 0, ...values, 1);
  return (
    <div className="sparkbar" style={{ height }} aria-hidden="true">
      {values.map((value, index) => {
        const ratio = Math.max(value / peak, value > 0 ? 0.08 : 0.04);
        const isLast = index === values.length - 1;
        return (
          <span
            key={index}
            className={highlightLast && isLast ? "filled" : value > 0 ? "filled" : ""}
            style={{ height: `${ratio * 100}%`, opacity: value > 0 ? 1 : 0.5 }}
          />
        );
      })}
    </div>
  );
}
