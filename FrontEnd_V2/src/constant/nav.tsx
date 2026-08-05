import type { ComponentType } from "react";
import {
    ArrowRepeat,
    Bullseye,
    Calendar3,
    CalendarCheckFill,
    ChatDotsFill,
    FileEarmarkBarGraphFill,
    GearFill,
    Grid1x2Fill,
    GraphUpArrow,
    PersonBadgeFill,
    type IconProps,
} from "react-bootstrap-icons";

import { ROUTES } from "@/routes/RoutePaths";

interface NavItem {
    to: string;
    label: string;
    icon: ComponentType<IconProps>;
    /** Match nested routes as active (e.g. /goals/12). */
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
            { to: ROUTES.PLAN, label: "Today's Plan", icon: CalendarCheckFill },
            { to: ROUTES.SCHEDULE, label: "Schedule", icon: Calendar3 },
            { to: ROUTES.MY_GOALS, label: "My Goals", icon: Bullseye },
            { to: ROUTES.HABIT_LIBRARY, label: "Habit Library", icon: ArrowRepeat },
        ],
    },
    {
        label: "Reflect",
        items: [
            { to: ROUTES.TRACK_PROGRESS, label: "Track Progress", icon: GraphUpArrow },
            { to: ROUTES.REPORTS, label: "Reports", icon: FileEarmarkBarGraphFill },
            { to: ROUTES.ASSISTANT, label: "Assistant", icon: ChatDotsFill },
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