import type { ComponentType } from "react";
import {
    ArrowRepeat,
    Bullseye,
    Calendar3,
    CalendarCheckFill,
    ChatDotsFill,
    FileEarmarkBarGraphFill,
    GearFill,
    GraphUpArrow,
    Grid1x2Fill,
    PersonBadgeFill,
    type IconProps,
} from "react-bootstrap-icons";
import { ROUTES } from "@/routes/RoutePaths";

interface NavItem {
    to: string;
    label: string;
    icon: ComponentType<IconProps>;
    end?: boolean;
}

interface NavSection {
    label?: string;
    items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
    {
        items: [{ to: ROUTES.DASHBOARD, label: "Dashboard", icon: Grid1x2Fill, end: true }],
    },
    {
        label: "Core loop",
        items: [
            { to: ROUTES.PLAN, label: "Today", icon: CalendarCheckFill },
            { to: ROUTES.CALENDAR, label: "Calendar", icon: Calendar3 },
            { to: ROUTES.GOALS, label: "Goals", icon: Bullseye },
            { to: ROUTES.REPETITIVE_TASKS, label: "Habit Library", icon: ArrowRepeat },
        ],
    },
    {
        label: "Reflect",
        items: [
            { to: ROUTES.TRACK, label: "Track", icon: GraphUpArrow },
            { to: ROUTES.REPORTS, label: "Reports", icon: FileEarmarkBarGraphFill },
            { to: ROUTES.COACH, label: "Coach", icon: ChatDotsFill },
        ],
    },
    {
        label: "You",
        items: [
            { to: ROUTES.PROFILE, label: "Profile", icon: PersonBadgeFill },
            { to: ROUTES.SETTINGS, label: "Settings", icon: GearFill },
        ],
    },
];