import type { ReactNode } from "react";

import { AuthProvider } from "./AuthContext";
import { RuntimeSettingsProvider } from "./RuntimeSettingsContext";
import { ThemeProvider } from "./ThemeContext";
import { ToastProvider } from "./ToastContext";

/** Composes every app-wide provider in the correct order. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ThemeProvider>
        <AuthProvider>
          <RuntimeSettingsProvider>{children}</RuntimeSettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </ToastProvider>
  );
}
