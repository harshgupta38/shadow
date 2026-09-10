import "@/pages/settings/SettingsShared.scss";

// ─── Card wrapper ─────────────────────────────────────────────────────────────

export interface CardProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  isDirty: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Card({ icon, title, desc, isDirty, children, className }: CardProps) {
  return (
    <div className={`st-card surface${isDirty ? " st-card--dirty" : ""}${className ? ` ${className}` : ""}`}>
      <div className="st-card-header">
        <h3 className="st-card-title">
          <span className="st-card-icon">{icon}</span>
          {title}
        </h3>
        <p className="st-card-desc">{desc}</p>
      </div>
      <div className="st-card-body">{children}</div>
    </div>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  className,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={`st-toggle-row${disabled ? " st-toggle-row--disabled" : ""} ${className ?? ""}`}>
      <div className="st-toggle-text">
        <span className="st-toggle-label">{label}</span>
        {description && <span className="st-toggle-desc">{description}</span>}
      </div>
      <div className="form-check form-switch mb-0 flex-shrink-0">
        <input
          className="form-check-input"
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          aria-label={label}
        />
      </div>
    </label>
  );
}

// ─── Segmented control ────────────────────────────────────────────────────────

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="st-segment" role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`st-segment-btn${value === opt.value ? " active" : ""}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

export function FieldRow({
  label,
  hint,
  noBorder,
  children,
  className,
}: {
  label: string;
  hint?: string;
  noBorder?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`st-field-row${noBorder ? " st-field-row--no-border" : ""} ${className ?? ""}`}>
      <div>
        <span className="st-field-label">{label}</span>
        {hint && <span className="st-field-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

