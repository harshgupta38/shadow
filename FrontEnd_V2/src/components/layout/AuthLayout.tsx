import { ChildProps } from "@/api";
import { CalendarCheckFill, GraphUpArrow, Stars } from "react-bootstrap-icons";

import { SITE_INDO } from "@/constant/site-indo";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { Brand } from "@/components/ui/Brand/Brand";

const FEATURES = [
	{
		icon: CalendarCheckFill,
		tone: "violet",
		title: "Plan your day, follow through",
		text: "Turn ambitions into a simple daily plan you actually finish.",
	},
	{
		icon: GraphUpArrow,
		tone: "blue",
		title: "See the progress that keeps you going",
		text: "Metrics, streaks and weekly reports that make momentum visible.",
	},
	{
		icon: Stars,
		tone: "mint",
		title: "An assistant that knows you",
		text: "AI coaching personalised from your goals and working style.",
	},
];

export function AuthLayout({ children }: ChildProps) {
	return (
		<div className="auth-shell">
			<aside className="auth-aside">
				<div className="auth-aside-orb orb-1" aria-hidden="true" />
				<div className="auth-aside-orb orb-2" aria-hidden="true" />
				<div className="auth-aside-inner">
					<header className="auth-aside-header">
						<span className="brand text-white">
							<span className="brand-mark auth-aside-brand-mark">
								<Stars size={20} />
							</span>
							<span className="brand-name text-white">{SITE_INDO.NAME}</span>
						</span>
					</header>

					<div className="auth-aside-body">
						<h1 className="auth-aside-title">Big goals, calm execution.</h1>
						<p className="auth-aside-subtitle">
							Define what matters, break it into milestones, and follow a daily plan with AI guidance.
						</p>

						<div className="auth-feature-list">
							{FEATURES.map((feature) => {
								const Icon = feature.icon;
								return (
									<article key={feature.title} className={`auth-feature auth-feature--${feature.tone}`}>
										<span className="auth-feature-icon">
											<Icon size={18} />
										</span>
										<div>
											<div className="auth-feature-title">{feature.title}</div>
											<div className="auth-feature-text">{feature.text}</div>
										</div>
									</article>
								);
							})}
						</div>
					</div>

					<footer className="auth-aside-footer">
						<div className="auth-aside-stats" aria-label="Product highlights">
							<span>Goal clarity</span>
							<span>Daily focus</span>
							<span>Weekly momentum</span>
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