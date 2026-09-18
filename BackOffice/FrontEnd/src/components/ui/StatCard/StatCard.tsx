interface StatCardProps {
  variant: "success" | "warn" | "info" | "brand";
  value: string;
  name: string;
  hint: string;
}

export function StatCard({ variant, value, name, hint }: StatCardProps) {
  return (
    <div className={`dp-stat dp-stat--${variant}`}>
      <span className="dp-stat-val">{value}</span>
      <div className="dp-stat-text">
        <span className="dp-stat-name">{name}</span>
        <span className="dp-stat-hint">{hint}</span>
      </div>
    </div>
  );
}
