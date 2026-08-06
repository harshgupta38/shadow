import { SITE_INDO } from "@/constant/site-indo";
import { Stars } from "react-bootstrap-icons";

interface BrandProps {
  /** Show the "Shadow" wordmark next to the mark. */
  withName?: boolean;
  subtitle?: string;
  size?: "sm" | "md" | "lg";
}

const MARK_SIZE: Record<NonNullable<BrandProps["size"]>, number> = {
  sm: 32,
  md: 38,
  lg: 52,
};

/** The Shadow logo: a gradient mark plus optional wordmark. */
export function Brand({ withName = true, subtitle, size = "md" }: BrandProps) {
  const dimension = MARK_SIZE[size];

  return (
    <span className="brand">
      <span
        className="brand-mark"
        style={{ width: dimension, height: dimension, borderRadius: dimension / 3 }}
      >
        <Stars size={dimension * 0.5} />
      </span>
      {withName && (
        <span className="d-flex flex-column">
          <span className="brand-name" style={{ fontSize: size === "lg" ? "1.5rem" : undefined }}>
            {SITE_INDO.NAME}
          </span>
          {subtitle && <span className="brand-sub">{subtitle}</span>}
        </span>
      )}
    </span>
  );
}
