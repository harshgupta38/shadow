import type { ComponentType } from "react";
import type { Icon } from "react-bootstrap-icons";
import {
  Grid1x2Fill,
  PeopleFill,
  DatabaseFill,
  CloudArrowUpFill,
  CpuFill,
  HeartPulseFill,
  Sliders,
  Terminal,
  Git,
} from "react-bootstrap-icons";
import { ROUTES } from "@/routes/RoutePaths";

export interface NavItem {
  label: string;
  icon: ComponentType<React.ComponentProps<Icon>>;
  to: string;
  end?: boolean;
}

export type HttpMethod = "GET" | "POST";

export interface NavTreeLeaf {
  label: string;
  method: HttpMethod;
}

export interface NavTreeFolder {
  label: string;
  icon: ComponentType<React.ComponentProps<Icon>>;
  children: NavTreeLeaf[];
}

export interface NavSection {
  label?: string;
  // A section renders either a flat list of links (`items`) or a nested,
  // expandable Postman-style tree (`tree`) — never both.
  items?: NavItem[];
  tree?: NavTreeFolder[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Overview", icon: Grid1x2Fill, to: ROUTES.HOME, end: true },
    ],
  },
  {
    label: "Shadow",
    items: [
      { label: "Users", icon: PeopleFill, to: ROUTES.SHADOW_USERS },
      { label: "Database", icon: DatabaseFill, to: ROUTES.SHADOW_DATABASE },
      { label: "Deployment", icon: CloudArrowUpFill, to: ROUTES.SHADOW_DEPLOYMENT },
      { label: "Server", icon: CpuFill, to: ROUTES.SHADOW_SERVER },
      { label: "Logs", icon: Terminal, to: ROUTES.SHADOW_LOGS },
    ],
  },
  // {
  //   label: "Controller",
  //   tree: [
  //     {
  //       label: "Health",
  //       icon: HeartPulseFill,
  //       children: [
  //         { label: "Root", method: "GET" },
  //         { label: "Controller", method: "GET" },
  //         { label: "Shadow V2", method: "GET" },
  //         { label: "Backoffice", method: "GET" },
  //         { label: "All In One", method: "GET" },
  //       ],
  //     },
  //     {
  //       label: "Control",
  //       icon: Sliders,
  //       children: [
  //         { label: "Restart Main", method: "POST" },
  //         { label: "Deploy Branch & Restart Main", method: "POST" },
  //         { label: "Checkout Commit & Rollback Main", method: "POST" },
  //         { label: "Restart BackOffice", method: "POST" },
  //         { label: "Deploy Branch & Restart BackOffice", method: "POST" },
  //       ],
  //     },
  //     {
  //       label: "Logs",
  //       icon: Terminal,
  //       children: [
  //         { label: "Shadow Logs", method: "GET" },
  //         { label: "Shadow Logs Download", method: "GET" },
  //         { label: "BackOffice Logs", method: "GET" },
  //         { label: "BackOffice Logs Download", method: "GET" },
  //         { label: "Controls Logs", method: "GET" },
  //       ],
  //     },
  //     {
  //       label: "Database",
  //       icon: DatabaseFill,
  //       children: [
  //         { label: "Shadow DB", method: "GET" },
  //         { label: "Shadow DB Query", method: "POST" },
  //         { label: "BackOffice DB", method: "GET" },
  //         { label: "BackOffice DB Query", method: "POST" },
  //       ],
  //     },
  //     {
  //       label: "GIT",
  //       icon: Git,
  //       children: [
  //         { label: "Shadow Git CLI", method: "POST" },
  //         { label: "BackOffice Git CLI", method: "POST" },
  //       ],
  //     },
  //   ],
  // },
  {
    label: "BackOffice",
    items: [
      { label: "Users", icon: PeopleFill, to: ROUTES.BACKOFFICE_USERS },
      { label: "Database", icon: DatabaseFill, to: ROUTES.BACKOFFICE_DATABASE },
      { label: "Deployment", icon: CloudArrowUpFill, to: ROUTES.BACKOFFICE_DEPLOYMENT },
      { label: "Server", icon: CpuFill, to: ROUTES.BACKOFFICE_SERVER },
      { label: "Logs", icon: Terminal, to: ROUTES.BACKOFFICE_LOGS },
    ],
  },
];
