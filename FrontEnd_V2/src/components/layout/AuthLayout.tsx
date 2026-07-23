import { ChildProps } from "@/api";
import { CalendarCheckFill, GraphUpArrow, Stars } from "react-bootstrap-icons";

import { SITE_INDO } from "@/constant/site-indo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Brand } from "@/components/ui/Brand";

const FEATURES = [
    {
        icon: CalendarCheckFill,
        title: "Plan your day, follow through",
        text: "Turn ambitions into a simple daily plan you actually finish.",
    },
    {
        icon: GraphUpArrow,
        title: "See the progress that keeps you going",
        text: "Metrics, streaks and weekly reports that make momentum visible.",
    },
    {
        icon: Stars,
        title: "An assistant that knows you",
        text: "AI coaching personalised from your goals and working style.",
    },
];

export function AuthLayout({ children }: ChildProps) {
  return (
    <div className="auth-shell" style={{ userSelect: "none", WebkitUserSelect: "none" }}>
      <aside className="auth-aside">
        <div style={{ position: "relative", zIndex: 1 }}>
          <span className="brand text-white">
            <span className="brand-mark" style={{ background: "rgba(255,255,255,0.18)" }}>
              <Stars size={20} />
            </span>
            <span className="brand-name text-white">{SITE_INDO.NAME}</span>
          </span>
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          <h1 className="display-6 fw-bold mb-3" style={{ maxWidth: 460 }}>
            Small steps, tracked daily.
          </h1>
          <p className="fs-5 opacity-75 mb-5" style={{ maxWidth: 440 }}>
            Your calm, always-available companion for reaching your life and career goals —
            one milestone at a time.
          </p>

          <div className="d-flex flex-column gap-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="auth-feature">
                  <span className="auth-feature-icon">
                    <Icon size={20} />
                  </span>
                  <div>
                    <div className="fw-semibold">{feature.title}</div>
                    <div className="opacity-75 small">{feature.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="small opacity-75 mb-0" style={{ position: "relative", zIndex: 1 }}>
          Private by design · Your data stays yours.
          <br />
          Made with 💗 by Harsh
        </p>
      </aside>

      <main className="auth-main position-relative">
        <div className="auth-theme-fab position-absolute top-0 end-0 p-3">
          <ThemeToggle />
        </div>

        <div className="auth-mobile-topbar d-md-none justify-content-between align-items-center">
          <span className="auth-mobile-brand">
            <Brand size="md" />
          </span>
          <span className="auth-mobile-theme">
            <ThemeToggle />
          </span>
        </div>

        <div className="auth-card fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}