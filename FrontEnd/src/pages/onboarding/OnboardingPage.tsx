import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckLg, Stars } from "react-bootstrap-icons";

import { api, ApiError, type OnboardingQuestion } from "@/api";
import { Brand } from "@/components/ui/Brand";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Pill } from "@/components/ui/Pill";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { MEMORY_CATEGORY_LABEL } from "@/lib/labels";

type Phase = "asking" | "reflecting";

export function OnboardingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshUser } = useAuth();
  const { data: questions, loading, error, reload } = useAsync(
    () => api.onboarding.questions(),
    [],
  );

  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>("asking");
  const [understanding, setUnderstanding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const total = questions?.length ?? 0;
  const current: OnboardingQuestion | undefined = questions?.[index];
  const progress = useMemo(
    () => (total === 0 ? 0 : Math.round((index / total) * 100)),
    [index, total],
  );

  async function finish() {
    setFinishing(true);
    try {
      await api.onboarding.complete();
      await refreshUser();
      toast.success("You're all set. Welcome to Jarvis!");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not finish onboarding.");
      setFinishing(false);
    }
  }

  async function submitAnswer(event: FormEvent) {
    event.preventDefault();
    if (!current || !answer.trim()) return;
    setBusy(true);
    try {
      const response = await api.onboarding.answer({
        question_id: current.id,
        question: current.question,
        category: current.category,
        answer: answer.trim(),
      });
      setUnderstanding(response.understanding);
      setPhase("reflecting");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save your answer.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (index + 1 >= total) {
      void finish();
      return;
    }
    setIndex((i) => i + 1);
    setAnswer("");
    setUnderstanding(null);
    setPhase("asking");
  }

  function skip() {
    if (index + 1 >= total) {
      void finish();
      return;
    }
    setIndex((i) => i + 1);
    setAnswer("");
    setUnderstanding(null);
    setPhase("asking");
  }

  return (
    <div className="min-vh-100 d-flex flex-column">
      <header className="d-flex align-items-center justify-content-between px-3 px-md-5 py-3">
        <Brand />
        <ThemeToggle />
      </header>

      <div className="flex-grow-1 d-flex align-items-center justify-content-center px-3 py-4">
        <div className="w-100" style={{ maxWidth: 640 }}>
          {loading && <LoadingState label="Preparing your interview…" />}

          {error && !loading && (
            <EmptyState
              icon={<Stars size={26} />}
              title="We couldn't load your interview"
              message={error}
              action={
                <button className="btn btn-brand" onClick={reload}>
                  Try again
                </button>
              }
            />
          )}

          {!loading && !error && current && (
            <div className="fade-in" key={current.id}>
              {/* Progress */}
              <div className="d-flex align-items-center justify-content-between mb-2 small text-muted-2">
                <span className="fw-semibold">
                  Question {index + 1} of {total}
                </span>
                <Pill variant="brand">{MEMORY_CATEGORY_LABEL[current.category]}</Pill>
              </div>
              <div className="progress mb-4" style={{ height: 6 }}>
                <div
                  className="progress-bar"
                  style={{ width: `${Math.max(progress, 4)}%` }}
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>

              <div className="surface p-4 p-md-5">
                <div className="d-flex gap-3 mb-4">
                  <span className="brand-mark" style={{ width: 40, height: 40, flexShrink: 0 }}>
                    <Stars size={20} />
                  </span>
                  <h1 className="h4 fw-bold mb-0 pt-1">{current.question}</h1>
                </div>

                {phase === "asking" && (
                  <form onSubmit={submitAnswer}>
                    <textarea
                      className="form-control"
                      rows={5}
                      placeholder="Share as much or as little as you like…"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      autoFocus
                    />
                    <div className="d-flex align-items-center justify-content-between mt-3">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={skip}
                        disabled={busy}
                      >
                        Skip for now
                      </button>
                      <button
                        type="submit"
                        className="btn btn-brand px-4"
                        disabled={busy || !answer.trim()}
                      >
                        {busy ? "Thinking…" : "Continue"}
                        {!busy && <ArrowRight className="ms-2" size={16} />}
                      </button>
                    </div>
                  </form>
                )}

                {phase === "reflecting" && understanding && (
                  <div className="fade-in">
                    <div className="surface-2 p-3 p-md-4 mb-4">
                      <div className="d-flex align-items-center gap-2 mb-2 text-muted-2 small fw-semibold text-uppercase" style={{ letterSpacing: "0.05em" }}>
                        <Stars size={14} /> What Jarvis understood
                      </div>
                      <p className="mb-0" style={{ lineHeight: 1.6 }}>
                        {understanding}
                      </p>
                    </div>
                    <div className="d-flex justify-content-end">
                      <button
                        type="button"
                        className="btn btn-brand px-4"
                        onClick={next}
                        disabled={finishing}
                      >
                        {index + 1 >= total ? (
                          finishing ? (
                            "Finishing…"
                          ) : (
                            <>
                              Finish <CheckLg className="ms-2" size={18} />
                            </>
                          )
                        ) : (
                          <>
                            Next question <ArrowRight className="ms-2" size={16} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-center text-faint small mt-4">
                Your answers help Jarvis personalise its guidance. You can refine these anytime in
                Settings.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
