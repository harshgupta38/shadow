import { AuthProvider } from "./AuthContext";
import { ChildProps } from "@/api";
import { ThemeProvider } from "./ThemeContext";
import { ToastProvider } from "./ToastContext";

export function AppProviders({ children }: ChildProps) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}