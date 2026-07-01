import type { ComponentType } from "react";
import {
  Bullseye,
  CalendarCheckFill,
  ChatDotsFill,
  FileEarmarkBarGraphFill,
  Grid1x2Fill,
  GraphUpArrow,
  type IconProps,
  JournalText,
} from "react-bootstrap-icons";

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<IconProps>;
  /** Match nested routes as active (e.g. /goals/12). */
  end?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/** Primary sidebar navigation, grouped around the core loop. */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ to: "/", label: "Dashboard", icon: Grid1x2Fill, end: true }],
  },
  {
    label: "Core loop",
    items: [
      { to: "/plan", label: "Today", icon: CalendarCheckFill },
      { to: "/goals", label: "Goals", icon: Bullseye },
      { to: "/track", label: "Track", icon: GraphUpArrow },
      { to: "/reports", label: "Reports", icon: FileEarmarkBarGraphFill },
    ],
  },
  {
    label: "Reflect",
    items: [
      { to: "/assistant", label: "Assistant", icon: ChatDotsFill },
      { to: "/journal", label: "Journal", icon: JournalText },
    ],
  },
];
