interface UsageMeterProps {
  used: number;
  limit: number;
}

/** A monthly allowance as a bar, with the numbers beside it. */
export function UsageMeter({ used, limit }: UsageMeterProps) {
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const usedUp = used >= limit;

  return (
    <div>
      <div className="progress" role="progressbar" aria-label="AI allowance used" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}>
        <div className={`progress-bar${usedUp ? " bg-danger" : ""}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="small text-body-secondary mt-1">
        {used.toLocaleString("en-IN")} of {limit.toLocaleString("en-IN")} AI tokens used
      </div>
    </div>
  );
}
