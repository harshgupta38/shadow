import { AuthProvider } from "./AuthContext";
import { ChildProps } from "@/api";

export function AppProviders({ children }: ChildProps) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}