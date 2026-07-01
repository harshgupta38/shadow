import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "./AuthContext";

interface LogoutConfirmValue {
  /** Open the confirmation modal before signing the user out. */
  requestLogout: () => void;
}

const LogoutConfirmContext = createContext<LogoutConfirmValue | undefined>(undefined);

/** Provides a single shared "are you sure?" modal for signing out. */
export function LogoutConfirmProvider({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const [show, setShow] = useState(false);

  const requestLogout = useCallback(() => setShow(true), []);
  const value = useMemo(() => ({ requestLogout }), [requestLogout]);

  return (
    <LogoutConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        show={show}
        title="Sign out?"
        message="You'll need to sign in again to get back to your dashboard."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onConfirm={() => {
          setShow(false);
          logout();
        }}
        onCancel={() => setShow(false)}
      />
    </LogoutConfirmContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLogoutConfirm(): LogoutConfirmValue {
  const ctx = useContext(LogoutConfirmContext);
  if (!ctx) throw new Error("useLogoutConfirm must be used within a LogoutConfirmProvider");
  return ctx;
}
