import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  CheckCircleFill,
  ExclamationTriangleFill,
  InfoCircleFill,
  XLg,
} from "react-bootstrap-icons";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  notify: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const ICONS: Record<ToastKind, typeof CheckCircleFill> = {
  success: CheckCircleFill,
  error: ExclamationTriangleFill,
  info: InfoCircleFill,
};

const COLORS: Record<ToastKind, string> = {
  success: "var(--jv-success)",
  error: "var(--jv-danger)",
  info: "var(--jv-info)",
};

let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = ++toastSeq;
      setToasts((prev) => [...prev, { id, kind, message }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
      success: (m) => notify(m, "success"),
      error: (m) => notify(m, "error"),
      info: (m) => notify(m, "info"),
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" role="status" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.kind];
          return (
            <div key={toast.id} className="toast-jv">
              <Icon size={18} style={{ color: COLORS[toast.kind], flexShrink: 0 }} />
              <span className="flex-grow-1 small fw-medium">{toast.message}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm p-0 border-0"
                aria-label="Dismiss"
                onClick={() => dismiss(toast.id)}
              >
                <XLg size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
