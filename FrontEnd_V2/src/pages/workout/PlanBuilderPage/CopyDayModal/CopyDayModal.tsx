import { useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { ExclamationTriangleFill, Files } from "react-bootstrap-icons";

import type { DraftDay } from "@/pages/workout/PlanBuilderPage/builderState";
import { WEEKDAY_LONG, WEEKDAY_SHORT, formatSessionDuration, pluralize } from "@/pages/workout/WorkoutPage.constants";
import { countSets, estimateMinutes } from "@/pages/workout/workoutMath";
import "./CopyDayModal.scss";

interface CopyDayModalProps {
  show: boolean;
  onClose: () => void;
  /** Called once the copy is fully confirmed — after the replace warning too, when one was needed. */
  onConfirm: (weekday: number) => void;
  /** Candidate source days — already filtered to exclude the target day and any day with no exercises. */
  days: DraftDay[];
  targetLabel: string;
  /** When > 0, picking a source first shows an inline "replace?" step instead of copying right away. */
  targetExerciseCount: number;
}

export function CopyDayModal({ show, onClose, onConfirm, days, targetLabel, targetExerciseCount }: CopyDayModalProps) {
  // A second step inside the same dialog — never a second <Modal>, which would crossfade against this one.
  const [pending, setPending] = useState<DraftDay | null>(null);

  useEffect(() => {
    if (show) setPending(null);
  }, [show]);

  function pick(d: DraftDay) {
    if (targetExerciseCount > 0) setPending(d);
    else onConfirm(d.weekday);
  }

  return (
    <Modal show={show} onHide={onClose} centered backdrop="static" dialogClassName="wk-copy-dialog">
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="wk-copy-title">
          {pending ? "Replace exercises?" : `Copy to ${targetLabel}`}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {pending ? (
          <div className="wk-copy-confirm">
            <ExclamationTriangleFill size={24} className="wk-copy-confirm-icon" aria-hidden="true" />
            <p>
              Copying <strong>{pending.name || WEEKDAY_LONG[pending.weekday]}</strong> here will replace the{" "}
              {pluralize(targetExerciseCount, "exercise")} already in <strong>{targetLabel}</strong>.
            </p>
            <div className="wk-copy-confirm-actions">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={() => onConfirm(pending.weekday)}>Copy &amp; replace</button>
            </div>
          </div>
        ) : (
          <>
            <p className="wk-copy-hint">Pick a day to copy its name, exercises, sets, reps and rest times from.</p>
            {days.length === 0 ? (
              <p className="wk-copy-empty">No other day has exercises yet to copy from.</p>
            ) : (
              <ul className="wk-copy-list">
                {days.map((d) => (
                  <li key={d.weekday}>
                    <button type="button" className="wk-copy-row" onClick={() => pick(d)}>
                      <span className="wk-copy-day-badge">{WEEKDAY_SHORT[d.weekday]}</span>
                      <span className="wk-copy-info">
                        <span className="wk-copy-name">{d.name || WEEKDAY_LONG[d.weekday]}</span>
                        <span className="wk-copy-meta">
                          {pluralize(d.exercises.length, "exercise")} · {pluralize(countSets(d.exercises), "set")} · ~
                          {formatSessionDuration(estimateMinutes(d.exercises) * 60)}
                        </span>
                      </span>
                      <Files size={16} className="wk-copy-icon" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
