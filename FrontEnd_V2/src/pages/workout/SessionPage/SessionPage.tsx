import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircleFill, CloudCheckFill, CloudSlashFill, PlusLg, StopwatchFill } from "react-bootstrap-icons";
import { useNavigate, useParams } from "react-router-dom";

import { api, ApiError } from "@/api";
import type { ExerciseSummary, SessionExercise, SessionSet, WorkoutSessionDetail } from "@/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { useToast } from "@/context/ToastContext";
import { ROUTES } from "@/routes/RoutePaths";
import { parseServerDate } from "@/services/date.service";
import { ExerciseDetailModal } from "@/pages/workout/ExerciseDetailModal/ExerciseDetailModal";
import { ExercisePickerModal } from "@/pages/workout/ExercisePickerModal/ExercisePickerModal";
import { Skeleton } from "@/pages/workout/Skeleton/Skeleton";
import { formatClock, pluralize } from "@/pages/workout/WorkoutPage.constants";
import { RestTimerBar } from "@/pages/workout/SessionPage/RestTimerBar/RestTimerBar";
import { SessionExerciseCard } from "@/pages/workout/SessionPage/SessionExerciseCard/SessionExerciseCard";
import { SessionSummary } from "@/pages/workout/SessionPage/SessionSummary/SessionSummary";
import {
  adoptServerIds,
  emptySet,
  newSessionExercise,
  prefillSet,
  toSaveRequest,
  totals,
} from "@/pages/workout/SessionPage/sessionState";
import "./SessionPage.scss";

const AUTOSAVE_DELAY_MS = 700;
const REST_OVER_VISIBLE_MS = 4000;

type SaveState = "idle" | "saving" | "saved" | "error";
type Dialog =
  | { kind: "finish-empty" }
  | { kind: "finish-partial"; open: number }
  | { kind: "discard" }
  | { kind: "delete" }
  | { kind: "remove"; index: number };

interface RestState {
  endsAt: number;
  total: number;
  name: string;
}

export function SessionPage() {
  const { sessionId } = useParams();
  const id = Number(sessionId);
  const navigate = useNavigate();
  const toast = useToast();

  const [session, setSession] = useState<WorkoutSessionDetail | null>(null);
  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [busy, setBusy] = useState<"finish" | "discard" | null>(null);
  const [justFinished, setJustFinished] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const [now, setNow] = useState(() => Date.now());
  const [rest, setRest] = useState<RestState | null>(null);

  const live = session?.status === "in_progress";

  // The autosave and the unmount flush read the freshest values without re-subscribing.
  const latest = useRef({ session, exercises, note, revision });
  latest.current = { session, exercises, note, revision };
  const savedRevision = useRef(0);

  const goBack = () => navigate(ROUTES.WORKOUT);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!Number.isInteger(id) || id <= 0) {
      setError("This workout doesn't exist.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.workout.getSession(id);
      setSession(data);
      setExercises(data.exercises);
      setNote(data.note ?? "");
      setRevision(0);
      savedRevision.current = 0;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this workout right now.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);

  const remaining = rest ? Math.ceil((rest.endsAt - now) / 1000) : 0;

  // Buzz once when rest ends, and clear the "rest over" bar after a few seconds.
  useEffect(() => {
    if (!rest) return;
    if (remaining === 0 && "vibrate" in navigator) navigator.vibrate?.([180, 80, 180]);
    if (remaining <= -Math.floor(REST_OVER_VISIBLE_MS / 1000)) setRest(null);
  }, [remaining, rest]);

  // ── Autosave ───────────────────────────────────────────────────────────────
  const persist = useCallback(async () => {
    const cur = latest.current;
    if (!cur.session || cur.session.status !== "in_progress") return;
    const revisionAtSave = cur.revision;
    setSaveState("saving");
    try {
      const res = await api.workout.saveSession(cur.session.id, toSaveRequest(cur.exercises, cur.note.trim() || null));
      savedRevision.current = revisionAtSave;
      setExercises((prev) => adoptServerIds(prev, res.exercises));
      setSaveState(latest.current.revision === revisionAtSave ? "saved" : "saving");
    } catch {
      setSaveState("error");
    }
  }, []);

  useEffect(() => {
    if (!live || revision === 0 || revision === savedRevision.current) return;
    const timer = window.setTimeout(() => void persist(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [revision, live, persist]);

  // Leaving the page with an unsaved edit: send it on the way out.
  useEffect(
    () => () => {
      const cur = latest.current;
      if (cur.session?.status === "in_progress" && cur.revision !== savedRevision.current) {
        void api.workout.saveSession(cur.session.id, toSaveRequest(cur.exercises, cur.note.trim() || null)).catch(() => undefined);
      }
    },
    [],
  );

  // ── Editing ────────────────────────────────────────────────────────────────
  const edit = useCallback((fn: (prev: SessionExercise[]) => SessionExercise[]) => {
    setExercises(fn);
    setRevision((r) => r + 1);
  }, []);

  const mapSets = (exerciseIndex: number, fn: (sets: SessionSet[]) => SessionSet[]) =>
    edit((prev) => prev.map((e, i) => (i === exerciseIndex ? { ...e, sets: fn(e.sets) } : e)));

  function editSet(exerciseIndex: number, setIndex: number, patch: Partial<SessionSet>) {
    mapSets(exerciseIndex, (sets) => sets.map((s, j) => (j === setIndex ? { ...s, ...patch } : s)));
  }

  function toggleDone(exerciseIndex: number, setIndex: number) {
    const item = exercises[exerciseIndex];
    const turningOn = !item.sets[setIndex].done;
    mapSets(exerciseIndex, (sets) =>
      sets.map((s, j) => (j === setIndex ? (turningOn ? { ...prefillSet(item, setIndex), done: true } : { ...s, done: false }) : s)),
    );
    if (turningOn && item.rest_seconds > 0) {
      const everythingDone = exercises.every((e, i) => e.sets.every((s, j) => s.done || (i === exerciseIndex && j === setIndex)));
      setRest(everythingDone ? null : { endsAt: Date.now() + item.rest_seconds * 1000, total: item.rest_seconds, name: item.exercise.name });
      setNow(Date.now());
    }
  }

  const addSet = (exerciseIndex: number) =>
    mapSets(exerciseIndex, (sets) => [...sets, emptySet(sets[sets.length - 1]?.weight_kg ?? null)]);

  const removeLastSet = (exerciseIndex: number) => mapSets(exerciseIndex, (sets) => sets.slice(0, -1));

  function requestRemove(index: number) {
    if (exercises[index].sets.some((s) => s.done)) setDialog({ kind: "remove", index });
    else edit((prev) => prev.filter((_, i) => i !== index));
  }

  function addExercises(picked: ExerciseSummary[]) {
    edit((prev) => [...prev, ...picked.map(newSessionExercise)]);
    setPickerOpen(false);
  }

  // ── Finish / discard ───────────────────────────────────────────────────────
  const stats = totals(exercises);

  function requestFinish() {
    if (stats.done === 0) setDialog({ kind: "finish-empty" });
    else if (stats.done < stats.planned) setDialog({ kind: "finish-partial", open: stats.planned - stats.done });
    else void finish();
  }

  async function finish() {
    setDialog(null);
    setBusy("finish");
    try {
      const res = await api.workout.finishSession(id, toSaveRequest(exercises, note.trim() || null));
      savedRevision.current = latest.current.revision;
      setSession(res);
      setExercises(res.exercises);
      setRest(null);
      setJustFinished(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't finish the workout. Your sets are still saved, try again.");
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    setDialog(null);
    setBusy("discard");
    try {
      savedRevision.current = latest.current.revision; // nothing left to flush
      await api.workout.deleteSession(id);
      toast.success(session?.status === "completed" ? "Workout deleted." : "Workout discarded.");
      goBack();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete this workout. Please try again.");
      setBusy(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="wk-session">
        <button type="button" className="page-header-back-link" onClick={goBack}><ArrowLeft size={16} /> Back</button>
        <IllustratedErrorState onRetry={() => void load()} />
      </div>
    );
  }

  if (loading || !session) {
    return (
      <div className="wk-session" aria-hidden="true">
        <Skeleton height={64} />
        <Skeleton height={230} />
        <Skeleton height={230} />
      </div>
    );
  }

  if (session.status === "completed") {
    return (
      <div className="wk-session">
        <SessionSummary
          session={session}
          justFinished={justFinished}
          deleting={busy === "discard"}
          onBack={goBack}
          onDelete={() => setDialog({ kind: "delete" })}
        />
        <ConfirmDialog
          show={dialog?.kind === "delete"}
          title="Delete this workout?"
          message="It will be removed from your history and progress totals. This can't be undone."
          confirmLabel="Delete workout"
          destructive
          busy={busy === "discard"}
          onConfirm={() => void discard()}
          onCancel={() => setDialog(null)}
        />
      </div>
    );
  }

  const elapsed = Math.max(0, Math.floor((now - parseServerDate(session.started_at).getTime()) / 1000));
  const pct = stats.planned > 0 ? (stats.done / stats.planned) * 100 : 0;

  return (
    <div className="wk-session">
      <header className="wk-session-bar surface">
        <button type="button" className="wk-session-back" onClick={goBack} aria-label="Back to workout. Your progress is saved.">
          <ArrowLeft size={18} />
        </button>

        <div className="wk-session-id">
          <h1>{session.name}</h1>
          <span>{session.plan_name ?? "Freestyle session"}</span>
        </div>

        <div className="wk-session-meta">
          <span className="wk-session-clock" title="Time since you started"><StopwatchFill size={14} aria-hidden="true" /> {formatClock(elapsed)}</span>
          <span className="wk-session-sets"><strong>{stats.done}</strong>/{stats.planned} sets</span>
          <span className={`wk-session-save is-${saveState}`} role="status">
            {saveState === "error" ? (
              <button type="button" onClick={() => void persist()}><CloudSlashFill size={13} /> Not saved. Retry</button>
            ) : saveState === "saving" ? (
              "Saving…"
            ) : saveState === "saved" ? (
              <><CloudCheckFill size={13} aria-hidden="true" /> Saved</>
            ) : null}
          </span>
        </div>

        <button type="button" className="btn btn-brand wk-session-finish" disabled={busy !== null} onClick={requestFinish}>
          <CheckCircleFill size={15} /> {busy === "finish" ? "Finishing…" : "Finish"}
        </button>

        <span className="wk-session-progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
      </header>

      {exercises.length === 0 ? (
        <section className="surface wk-session-empty">
          <h2>Add your first exercise</h2>
          <p>Pick what you're training today and log each set as you go.</p>
          <button type="button" className="btn btn-brand" onClick={() => setPickerOpen(true)}><PlusLg size={14} /> Add exercises</button>
        </section>
      ) : (
        <div className="wk-session-list">
          {exercises.map((item, i) => (
            <SessionExerciseCard
              key={item.id ?? `new-${item.exercise.id}-${i}`}
              item={item}
              onOpen={() => setDetailId(item.exercise.id)}
              onEditSet={(setIndex, patch) => editSet(i, setIndex, patch)}
              onToggleDone={(setIndex) => toggleDone(i, setIndex)}
              onAddSet={() => addSet(i)}
              onRemoveSet={() => removeLastSet(i)}
              onRemove={() => requestRemove(i)}
            />
          ))}

          <button type="button" className="wk-session-add" onClick={() => setPickerOpen(true)}>
            <PlusLg size={14} /> Add exercise
          </button>
        </div>
      )}

      <label className="surface wk-session-note">
        <span>Workout notes</span>
        <textarea
          rows={2}
          maxLength={2000}
          placeholder="How did it feel? Anything to remember next time?"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setRevision((r) => r + 1);
          }}
        />
      </label>

      <button type="button" className="wk-session-discard" disabled={busy !== null} onClick={() => setDialog({ kind: "discard" })}>
        Discard this workout
      </button>

      {rest && (
        <RestTimerBar
          exerciseName={rest.name}
          remainingSeconds={remaining}
          totalSeconds={rest.total}
          onSkip={() => setRest(null)}
          onAddSeconds={(s) => setRest((r) => (r ? { ...r, endsAt: r.endsAt + s * 1000, total: r.total + s } : r))}
        />
      )}

      <ExercisePickerModal
        show={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addExercises}
        excludeIds={exercises.map((e) => e.exercise.id)}
        title="Add to this workout"
      />
      <ExerciseDetailModal exerciseId={detailId} onClose={() => setDetailId(null)} />

      <ConfirmDialog
        show={dialog?.kind === "finish-empty"}
        title="No sets logged yet"
        message="Tick off at least one set to save this workout, or discard it."
        confirmLabel="Discard workout"
        cancelLabel="Keep going"
        destructive
        onConfirm={() => void discard()}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        show={dialog?.kind === "finish-partial"}
        title="Finish with sets still open?"
        message={dialog?.kind === "finish-partial" ? `${pluralize(dialog.open, "set")} ${dialog.open === 1 ? "isn't" : "aren't"} ticked off. Only completed sets are saved.` : undefined}
        confirmLabel="Finish workout"
        cancelLabel="Keep going"
        onConfirm={() => void finish()}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        show={dialog?.kind === "discard"}
        title="Discard this workout?"
        message="Everything you've logged in it will be deleted."
        confirmLabel="Discard"
        destructive
        busy={busy === "discard"}
        onConfirm={() => void discard()}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        show={dialog?.kind === "remove"}
        title="Remove this exercise?"
        message="Sets you've already logged for it will be lost."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (dialog?.kind === "remove") edit((prev) => prev.filter((_, i) => i !== dialog.index));
          setDialog(null);
        }}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
