import { Modal } from "react-bootstrap";
import { ExclamationTriangleFill } from "react-bootstrap-icons";

interface ConfirmDialogProps {
    show: boolean;
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    show,
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    destructive = false,
    busy = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    return (
        <Modal show={show} onHide={onCancel} centered backdrop="static">
            <Modal.Body className="p-4 text-center">
                <div
                    className="empty-icon mx-auto mb-3"
                    style={destructive ? { color: "var(--jv-danger)" } : undefined}
                >
                    <ExclamationTriangleFill size={26} />
                </div>
                <h2 className="h5 fw-bold">{title}</h2>
                {message && <p className="text-muted-2 mb-4">{message}</p>}
                <div className="d-flex gap-2 justify-content-center">
                    <button type="button" className="btn btn-outline-secondary px-4" onClick={onCancel} disabled={busy}>
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        className={`btn px-4 ${destructive ? "btn-danger" : "btn-brand"}`}
                        onClick={onConfirm}
                        disabled={busy}
                    >
                        {busy ? "Working…" : confirmLabel}
                    </button>
                </div>
            </Modal.Body>
        </Modal>
    );
}
