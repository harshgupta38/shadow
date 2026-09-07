import { BellFill, InfoCircleFill, Stars } from "react-bootstrap-icons";

import type { NotificationType } from "@/api/types";

export const TYPE_ICON: Record<NotificationType, typeof BellFill> = {
  reminder: BellFill,
  system: InfoCircleFill,
  agent: Stars,
};

export const TYPE_COLOR: Record<NotificationType, string> = {
  reminder: "var(--jv-brand-1)",
  system: "var(--jv-info)",
  agent: "var(--jv-warn)",
};
