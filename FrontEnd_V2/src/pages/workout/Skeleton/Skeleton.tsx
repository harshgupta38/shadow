import type { CSSProperties } from "react";

import "./Skeleton.scss";

interface SkeletonProps {
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
}

// Shimmering placeholder block used while workout data loads.
export function Skeleton({ height, width, className, style }: SkeletonProps) {
  return <div className={`wk-skel${className ? ` ${className}` : ""}`} style={{ height, width, ...style }} aria-hidden="true" />;
}
