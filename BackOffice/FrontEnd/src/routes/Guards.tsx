// TODO: restore real guards when backend auth is ready
import { Outlet } from "react-router-dom";

export function RequireAuth() { return <Outlet />; }
export function GuestOnly()   { return <Outlet />; }
