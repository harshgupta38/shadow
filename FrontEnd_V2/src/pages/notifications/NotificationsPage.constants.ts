import {
  BellFill,
  ExclamationTriangleFill,
  InfoCircleFill,
  ShieldFill,
  Stars,
  TrophyFill,
} from "react-bootstrap-icons";

import type { NotificationType } from "@/api/types";

export const TYPE_ICON: Record<NotificationType, typeof BellFill> = {
  system:      InfoCircleFill,
  reminder:    BellFill,
  agent:       Stars,
  security:    ShieldFill,
  warning:     ExclamationTriangleFill,
  achievement: TrophyFill,
};

export const TYPE_COLOR: Record<NotificationType, string> = {
  system:      "var(--jv-info)",
  reminder:    "var(--jv-brand-1)",
  agent:       "var(--jv-warn)",
  security:    "var(--jv-danger)",
  warning:     "var(--jv-warn)",
  achievement: "var(--jv-success)",
};
