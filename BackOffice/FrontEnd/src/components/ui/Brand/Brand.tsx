import { Stars } from "react-bootstrap-icons";
import { SITE_INFO } from "@/constant/site-info";

interface BrandProps {
  size?: "sm" | "md" | "lg";
}

const MARK_SIZE = { sm: 30, md: 38, lg: 52 };

export function Brand({ size = "md" }: BrandProps) {
  const dim = MARK_SIZE[size];
  return (
    <span className="brand">
      <span
        className="brand-mark"
        style={{ width: dim, height: dim, borderRadius: dim / 3 }}
      >
        <Stars size={dim * 0.5} />
      </span>
      <span className="d-flex flex-column">
        <span className="brand-name" style={{ fontSize: size === "lg" ? "1.5rem" : undefined }}>
          {SITE_INFO.NAME}
        </span>
        <span className="brand-sub">{SITE_INFO.SUBTITLE}</span>
      </span>
    </span>
  );
}
