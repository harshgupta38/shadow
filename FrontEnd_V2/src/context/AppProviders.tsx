import { AuthProvider } from "@/context/AuthContext";
import { ChildProps } from "@/api";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";
import { PlannerProvider } from "@/context/PlannerContext";
import { AccessibilityProvider } from "@/context/AccessibilityContext";

export function AppProviders({ children }: ChildProps) {
  return (
    <ThemeProvider>
      <AccessibilityProvider>
        <AuthProvider>
          <PlannerProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </PlannerProvider>
        </AuthProvider>
      </AccessibilityProvider>
    </ThemeProvider>
  );
}