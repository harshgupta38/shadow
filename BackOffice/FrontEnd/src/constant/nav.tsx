import type { ComponentType } from "react";
import type { Icon } from "react-bootstrap-icons";
import {
  Grid1x2Fill,
  CloudArrowUpFill,
  DatabaseFill,
  CpuFill,
} from "react-bootstrap-icons";
import { ROUTES } from "@/routes/RoutePaths";

interface NavItem {
  label: string;
  icon: ComponentType<React.ComponentProps<Icon>>;
  to: string;
  end?: boolean;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Overview",  icon: Grid1x2Fill,       to: ROUTES.HOME,     end: true },
    ],
  },
  {
    label: "Manage",
    items: [
      { label: "Deploy",    icon: CloudArrowUpFill,  to: ROUTES.DEPLOY    },
      { label: "Database",  icon: DatabaseFill,      to: ROUTES.DATABASE  },
      { label: "Server",    icon: CpuFill,           to: ROUTES.SERVER    },
    ],
  },
];
