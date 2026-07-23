import { AuthProvider } from "./AuthContext";
import { ChildProps } from "@/api";
import { ThemeProvider } from "./ThemeContext";

export function AppProviders({ children }: ChildProps) {
  return (
    <ThemeProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </ThemeProvider>
  );
}