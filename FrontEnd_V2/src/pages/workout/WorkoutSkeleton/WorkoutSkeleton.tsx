import type { CSSProperties } from "react";

import "./WorkoutSkeleton.scss";

interface WorkoutSkeletonProps {
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
}

// Shimmering placeholder block used while workout data loads.
export function WorkoutSkeleton({ height, width, className, style }: WorkoutSkeletonProps) {
  return <div className={`wk-skel${className ? ` ${className}` : ""}`} style={{ height, width, ...style }} aria-hidden="true" />;
}
