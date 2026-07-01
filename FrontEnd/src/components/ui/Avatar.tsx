import type { CSSProperties } from "react";

import { initials } from "@/lib/format";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  /** Optional custom gradient stops. */
  gradient?: [string, string];
}

export function Avatar({ name, size = "md", gradient }: AvatarProps) {
  const style: CSSProperties | undefined = gradient
    ? { background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }
    : undefined;
  return (
    <span className={`avatar avatar-${size}`} style={style} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
