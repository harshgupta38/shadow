import type { ReactNode } from "react";

import { AuthProvider } from "./AuthContext";
import { PreferencesProvider } from "./PreferencesContext";
import { ThemeProvider } from "./ThemeContext";
import { ToastProvider } from "./ToastContext";

/** Composes every app-wide provider in the correct order. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <PreferencesProvider>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
