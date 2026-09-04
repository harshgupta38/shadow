import type { HTMLAttributes, ReactNode } from "react";

type PillVariant = "success" | "warn" | "danger" | "info" | "brand" | "muted";

const VARIANT_CLASS: Record<PillVariant, string> = {
  success: "pill-success",
  warn: "pill-warn",
  danger: "pill-danger",
  info: "pill-info",
  brand: "pill-brand",
  muted: "",
};

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: PillVariant;
  /** Show a leading status dot. */
  dot?: boolean;
}

export function Pill({
  children,
  variant = "muted",
  dot = false,
  className = "",
  ...props
}: PillProps) {
  return (
    <span {...props} className={`pill ${VARIANT_CLASS[variant]} ${className}`.trim()}>
      {dot && <span className="dot" style={{ background: "currentColor" }} />}
      {children}
    </span>
  );
}
