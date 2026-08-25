import { type ReactNode } from "react";
import { Modal } from "react-bootstrap";
import { ExclamationTriangleFill } from "react-bootstrap-icons";

export interface ChoiceDialogButton {
    label: string;
    variant?: "brand" | "soft" | "outline-secondary" | "danger";
    onClick: () => void;
    disabled?: boolean;
}

interface ChoiceDialogProps {
    show: boolean;
    title: string;
    message?: string;
    icon?: ReactNode;
    iconColor?: string;
    buttons: ChoiceDialogButton[];
    onHide: () => void;
}

export function ChoiceDialog({
    show,
    title,
    message,
    icon = <ExclamationTriangleFill size={26} />,
    iconColor,
    buttons,
    onHide,
}: ChoiceDialogProps) {
    return (
        <Modal show={show} onHide={onHide} centered backdrop="static">
            <Modal.Body className="p-4 text-center">
                {icon && (
                    <div className="empty-icon mx-auto mb-3" style={iconColor ? { color: iconColor } : undefined}>
                        {icon}
                    </div>
                )}
                <h2 className="h5 fw-bold">{title}</h2>
                {message && <p className="text-muted-2 mb-4">{message}</p>}
                <div className="d-flex gap-2 justify-content-center flex-wrap">
                    {buttons.map((btn, i) => (
                        <button
                            key={i}
                            type="button"
                            className={`btn px-4 btn-${btn.variant ?? "outline-secondary"}`}
                            onClick={btn.onClick}
                            disabled={btn.disabled}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>
            </Modal.Body>
        </Modal>
    );
}
