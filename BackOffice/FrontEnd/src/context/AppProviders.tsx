import type { ReactNode } from "react";
import { ThemeProvider } from "./ThemeContext";
import { AuthProvider } from "./AuthContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
