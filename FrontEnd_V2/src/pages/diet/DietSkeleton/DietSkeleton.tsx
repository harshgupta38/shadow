import type { CSSProperties } from "react";

import "./DietSkeleton.scss";

interface DietSkeletonProps {
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
}

// Shimmering placeholder block shown while Diet data loads.
export function DietSkeleton({ height, width, className, style }: DietSkeletonProps) {
  return <div className={`dt-skel${className ? ` ${className}` : ""}`} style={{ height, width, ...style }} aria-hidden="true" />;
}
