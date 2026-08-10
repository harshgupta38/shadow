import { useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { CalendarEvent } from "react-bootstrap-icons";

import "@/components/ui/TargetDatePromptDialog/TargetDatePromptDialog.scss";

interface TargetDatePromptDialogProps {
    show: boolean;
    title?: string;
    message?: string;
    initialDate?: string | null;
    busy?: boolean;
    allowSkip?: boolean;
    onConfirm: (targetDate: string) => void;
    onClear: () => void;
    onSkip: () => void;
    onCancel: () => void;
}

function toInputDate(value: string | null | undefined): string {
    if (!value) return "";
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return "";
    return new Date(parsed).toISOString().slice(0, 10);
}

export function TargetDatePromptDialog({
    show,
    title = "Set target date?",
    message = "This milestone is moving to In Progress. You can set a target date now or skip.",
    initialDate,
    busy = false,
    allowSkip = true,
    onConfirm,
    onClear,
    onSkip,
    onCancel,
}: TargetDatePromptDialogProps) {
    const [targetDate, setTargetDate] = useState("");
    const hasInitialDate = Boolean(toInputDate(initialDate));

    useEffect(() => {
        if (show) {
            setTargetDate(toInputDate(initialDate));
        }
    }, [show, initialDate]);

    return (
        <Modal show={show} onHide={onCancel} centered backdrop="static">
            <Modal.Body className="p-4 target-date-prompt-dialog">
                <div className="empty-icon mx-auto mb-3">
                    <CalendarEvent size={24} />
                </div>
                <h2 className="h5 fw-bold text-center">{title}</h2>
                <p className="text-muted-2 mb-3 text-center">{message}</p>

                <label htmlFor="target-date-input" className="form-label fw-semibold">
                    Target date
                </label>
                <input
                    id="target-date-input"
                    type="date"
                    className="form-control"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    disabled={busy}
                />

                <div className="d-flex gap-2 justify-content-end mt-4">
                    {hasInitialDate ? (
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={onClear}
                            disabled={busy}
                        >
                            Clear Date
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={onCancel}
                            disabled={busy}
                        >
                            Cancel
                        </button>
                    )}
                    {allowSkip && (
                        <button
                            type="button"
                            className="btn btn-soft"
                            onClick={onSkip}
                            disabled={busy}
                        >
                            Skip
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-brand"
                        onClick={() => onConfirm(targetDate)}
                        disabled={busy || !targetDate}
                    >
                        {busy ? "Working..." : "Set Date"}
                    </button>
                </div>
            </Modal.Body>
        </Modal>
    );
}