import { ExclamationTriangleFill } from "react-bootstrap-icons";

import { ChoiceDialog } from "@/components/ui/ChoiceDialog/ChoiceDialog";

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
        <ChoiceDialog
            show={show}
            title={title}
            message={message}
            icon={<ExclamationTriangleFill size={26} />}
            iconColor={destructive ? "var(--jv-danger)" : undefined}
            onHide={onCancel}
            buttons={[
                { label: cancelLabel, variant: "outline-secondary", onClick: onCancel, disabled: busy },
                {
                    label: busy ? "Working…" : confirmLabel,
                    variant: destructive ? "danger" : "brand",
                    onClick: onConfirm,
                    disabled: busy,
                },
            ]}
        />
    );
}
