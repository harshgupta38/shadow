import { ChildProps } from "@/api";
import { Check2Circle, Lightning } from "react-bootstrap-icons";

import { Brand } from "@/components/ui/Brand/Brand";
import { CardStackVisual } from "@/components/ui/CardStackVisual/CardStackVisual";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";

const PROOF_POINTS = ["Goal clarity", "Daily focus", "Weekly momentum"];

export function AuthLayout({ children }: ChildProps) {
	return (
		<div className="auth-shell">
			<aside className="auth-aside">
				<div className="auth-aside-inner">
					<header className="auth-aside-header">
						<Brand size="md" />
					</header>

					<div className="auth-aside-body">
						<span className="auth-aside-kicker">
							<Lightning size={11} />
							AI-guided execution
						</span>
						<h1 className="auth-aside-title">
							Big goals,
							<br />
							<span className="auth-aside-title-accent">calm execution.</span>
						</h1>
						<p className="auth-aside-subtitle">
							Define what matters, break it into milestones, and follow a daily plan with AI guidance.
						</p>

						<div className="auth-aside-visual">
							<CardStackVisual />
						</div>
					</div>

					<footer className="auth-aside-footer">
						<div className="auth-aside-proof" aria-label="Product highlights">
							{PROOF_POINTS.map((point) => (
								<span key={point}>
									<Check2Circle size={14} /> {point}
								</span>
							))}
						</div>
						<p className="auth-aside-footnote mb-0">
							Private by design · Your data stays yours.
							<br />
							Made with care by Harsh
						</p>
					</footer>
				</div>
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
