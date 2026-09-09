import { Link, Navigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart,
  Check2Circle,
  Compass,
  Lightbulb,
} from "react-bootstrap-icons";

import { Brand } from "@/components/ui/Brand/Brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { ROUTES } from "@/routes/RoutePaths";
import { SITE_INDO } from "@/constant/site-indo";

import dashboardLight from "@/assets/landing/dashboard-light.png";
import dashboardDark from "@/assets/landing/dashboard-dark.png";
import goalDetailLight from "@/assets/landing/goal-detail-light.png";
import goalDetailDark from "@/assets/landing/goal-detail-dark.png";
import planLight from "@/assets/landing/plan-light.png";
import planDark from "@/assets/landing/plan-dark.png";
import trackProgressLight from "@/assets/landing/track-progress-light.png";
import trackProgressDark from "@/assets/landing/track-progress-dark.png";
import reportDetailLight from "@/assets/landing/report-detail-light.png";
import reportDetailDark from "@/assets/landing/report-detail-dark.png";
import assistantLight from "@/assets/landing/assistant-light.png";
import assistantDark from "@/assets/landing/assistant-dark.png";

import "@/pages/landing_page/LandingPage.scss";

function CardStackVisual() {
  return (
    <div className="landing-stack" aria-hidden="true">
      <div className="landing-stack-card landing-stack-card--today">
        <p className="landing-stack-title">Today</p>
        <div className="landing-stack-row">
          <span className="landing-stack-check">✓</span> Morning workout
        </div>
        <div className="landing-stack-row">
          <span className="landing-stack-check">✓</span> Read 20 pages
        </div>
        <div className="landing-stack-row">
          <span className="landing-stack-check landing-stack-check--pending">○</span> Deep work block
        </div>
      </div>

      <div className="landing-stack-card landing-stack-card--progress">
        <p className="landing-stack-title">Progress</p>
        <div className="landing-stack-ring">
          <svg className="landing-stack-ring-svg" viewBox="0 0 62 62">
            <defs>
              <linearGradient id="landingStackRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--jv-brand-1)" />
                <stop offset="100%" stopColor="var(--jv-brand-2)" />
              </linearGradient>
            </defs>
            <circle className="landing-stack-ring-track" cx={31} cy={31} r={26} fill="none" strokeWidth={6} />
            <circle
              className="landing-stack-ring-value"
              cx={31} cy={31} r={26} fill="none" strokeWidth={6}
              stroke="url(#landingStackRingGradient)"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 26}
              strokeDashoffset={2 * Math.PI * 26 * (1 - 0.64)}
            />
          </svg>
          <span className="landing-stack-ring-pct">64%</span>
        </div>
        <p className="landing-stack-sub">9 of 14 done</p>
      </div>

      <div className="landing-stack-card landing-stack-card--streak">
        <p className="landing-stack-flame">🔥 11</p>
        <p className="landing-stack-sub">day streak</p>
      </div>
    </div>
  );
}

const STEPS = [
  {
    icon: Lightbulb,
    title: "Find the right goal",
    text: "If your direction is unclear, the assistant helps you discover goals for life, work, and relationships.",
  },
  {
    icon: Compass,
    title: "Break it into milestones",
    text: "Turn one big target into practical milestones with clear timelines and measurable outcomes.",
  },
  {
    icon: BarChart,
    title: "Execute and improve daily",
    text: "Your daily planner generates tasks, tracks completion, and the AI coach guides your next move every week.",
  },
] as const;

const PROBLEMS = [
  "You set a goal in January. By February, you can't even remember the plan.",
  "Todo apps track tasks. None of them know why a task matters to your life.",
  "You finish a busy week and still can't tell if you actually moved forward.",
] as const;

interface ShowcaseItem {
  eyebrow: string;
  title: string;
  text: string;
  bullets: readonly string[];
  light: string;
  dark: string;
  alt: string;
}

const SHOWCASE_ITEMS: readonly ShowcaseItem[] = [
  {
    eyebrow: "Dashboard",
    title: "Your day, at a glance",
    text: "The moment you log in, Shadow shows exactly where you stand — today's tasks and habits, your current streak, and the alignment score from your last report. No digging through five apps to check if you're on track.",
    bullets: [
      "Today's plan, streak, and report score in one view",
      "One tap into today's plan or your latest report",
    ],
    light: dashboardLight,
    dark: dashboardDark,
    alt: "Shadow dashboard showing today's plan, current streak, and the latest daily report",
  },
  {
    eyebrow: "Goals & Milestones",
    title: "Break the big goal down",
    text: "A goal like “get the SDE offer” is too big to act on. Your Goal Coach turns it into milestones with real dates, then into tasks you can actually start today.",
    bullets: [
      "AI-drafted milestones based on your goal and situation",
      "Progress tracked milestone by milestone, not one big bar",
    ],
    light: goalDetailLight,
    dark: goalDetailDark,
    alt: "Goal detail page showing milestones broken down from a single goal",
  },
  {
    eyebrow: "Daily Plan",
    title: "One list, every day",
    text: "Habits, one-time tasks, and scheduled items — merged into a single plan for today, sorted by priority, with a ring showing how much you've actually finished.",
    bullets: [
      "Habits, tasks, and scheduled items in one place",
      "Priority breakdown so you know what to do first",
    ],
    light: planLight,
    dark: planDark,
    alt: "Today's plan page listing habits and tasks with a completion ring",
  },
  {
    eyebrow: "Track Progress",
    title: "Watch the streak build",
    text: "A weekly matrix of every habit you're tracking, plus metric cards with 7-day trends — so “I think I've been consistent” becomes something you can actually see.",
    bullets: [
      "Weekly done/missed matrix across all habits",
      "7-day trend lines for anything you measure",
    ],
    light: trackProgressLight,
    dark: trackProgressDark,
    alt: "Track progress page showing a weekly habit matrix and metric trend cards",
  },
  {
    eyebrow: "Reports",
    title: "A coach that reviews your week",
    text: "Every day, Shadow scores how aligned you were with your goals, calls out what went well and what needs attention, and tells you exactly what to adjust tomorrow.",
    bullets: [
      "Daily alignment score per goal, not just overall",
      "Concrete next-step suggestions, not generic advice",
    ],
    light: reportDetailLight,
    dark: reportDetailDark,
    alt: "Daily report page showing an alignment score, goal breakdown, and highlights",
  },
  {
    eyebrow: "AI Assistant",
    title: "Talk it through",
    text: "Four coaches for four situations — general life coaching, structured goal discovery, career advice, and pattern-driven insights from your own data. Chat like you would with a person, not a form.",
    bullets: [
      "Goal Coach turns a conversation into a saved goal proposal",
      "Insights agent reads your own tracked data back to you",
    ],
    light: assistantLight,
    dark: assistantDark,
    alt: "AI assistant chat helping turn a goal into a structured proposal",
  },
] as const;

function FeatureShowcaseRow({ item, index, effectiveTheme }: { item: ShowcaseItem; index: number; effectiveTheme: "light" | "dark" }) {
  return (
    <article className={`landing-feature-row reveal-up ${index % 2 === 1 ? "is-reversed" : ""}`}>
      <div className="landing-feature-media">
        <div className="landing-feature-frame">
          <div className="landing-feature-frame-bar">
            <span /><span /><span />
          </div>
          <img src={effectiveTheme === "dark" ? item.dark : item.light} alt={item.alt} loading="lazy" />
        </div>
      </div>
      <div className="landing-feature-copy">
        <span className="landing-feature-eyebrow">{item.eyebrow}</span>
        <h3>{item.title}</h3>
        <p>{item.text}</p>
        <ul className="landing-feature-bullets">
          {item.bullets.map((bullet) => (
            <li key={bullet}>
              <Check2Circle size={15} />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export function LandingPage() {
  const { status, isAuthenticated } = useAuth();
  const { effectiveTheme } = useTheme();

  if (status === "loading")
    return null;

  if (isAuthenticated)
    return <Navigate to={ROUTES.DASHBOARD} replace />;

  return (
    <div className="landing-shell">
      <header className="landing-topbar">
        <Brand size="md" />
        <div className="landing-topbar-actions">
          <ThemeToggle />
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-copy reveal-up">
            <h1 className="landing-title">
              Turn goals into progress,
              <br />
              <span className="landing-title-accent">one day at a time.</span>
            </h1>
            <p className="landing-subtitle">
              Shadow helps you choose a goal, break it into milestones, and stay consistent with daily actions.
              Your AI coach adapts your next steps as you progress.
            </p>
            <div className="landing-hero-actions">
              <Link to={ROUTES.REGISTER} className="btn btn-brand btn-lg landing-hero-btn">
                Start my goal <ArrowRight size={18} className="ms-1" />
              </Link>
              <Link to={ROUTES.LOGIN} className="btn btn-outline-secondary btn-lg landing-hero-btn">
                I have an account
              </Link>
            </div>
            <div className="landing-proof">
              <span>
                <Check2Circle size={16} /> Goal discovery
              </span>
              <span>
                <Check2Circle size={16} /> Milestone planning
              </span>
              <span>
                <Check2Circle size={16} /> Daily AI coaching
              </span>
            </div>
          </div>

          <div className="landing-hero-visual reveal-up-delay">
            <CardStackVisual />
          </div>
        </section>

        <section className="landing-problem reveal-up">
          <h2 className="landing-problem-title">Sound familiar?</h2>
          <div className="landing-problem-grid">
            {PROBLEMS.map((problem) => (
              <div key={problem} className="landing-problem-item">
                <span className="landing-problem-mark" aria-hidden="true">&ldquo;</span>
                <p>{problem}</p>
              </div>
            ))}
          </div>
          <p className="landing-problem-resolve">
            Shadow closes that loop — one goal, a real day-by-day plan, and an honest weekly review.
          </p>
        </section>

        <section className="landing-steps">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <article key={step.title} className="landing-step-card reveal-up" style={{ animationDelay: `${index * 120}ms` }}>
                <span className="landing-step-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className="landing-step-icon">
                  <Icon size={20} />
                </span>
                <h2>{step.title}</h2>
                <p>{step.text}</p>
              </article>
            );
          })}
        </section>

        <section className="landing-showcase">
          <div className="landing-showcase-head reveal-up">
            <h2>See it in action</h2>
            <p>Every screen below is the real product — not a mockup.</p>
          </div>
          {SHOWCASE_ITEMS.map((item, index) => (
            <FeatureShowcaseRow key={item.eyebrow} item={item} index={index} effectiveTheme={effectiveTheme} />
          ))}
        </section>

        <section className="landing-cta reveal-up">
          <h2>Ready to turn your goal into <span className="landing-cta-accent">daily wins?</span></h2>
          <p>
            Start with one goal. Shadow builds your milestones, daily actions, and weekly guidance so you keep moving with clarity.
          </p>
          <div className="landing-cta-actions">
            <Link to={ROUTES.REGISTER} className="btn btn-brand btn-lg landing-cta-btn-primary">
              Create my plan <ArrowRight size={17} className="ms-1" />
            </Link>
            <Link to={ROUTES.LOGIN} className="btn landing-cta-btn-secondary btn-lg">
              View dashboard
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <Brand size="sm" withName={false} />
        <p className="landing-footer-copyright">© {new Date().getFullYear()} {SITE_INDO.NAME}. All rights reserved.</p>
      </footer>
    </div>
  );
}
