import { forwardRef, InputHTMLAttributes, ReactNode } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string | null;
    hint?: string;

    icon?: ReactNode;
    trailing?: ReactNode;

    onClearError?: () => void;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
    { label, error, hint, icon, trailing, onClearError, id, className = "", ...rest }, ref,
) {
    const inputId = id ?? rest.name;
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        onClearError?.();
        rest.onChange?.(event);
    };

    return (
        <div className="mb-3">
            {label && (
                <label htmlFor={inputId} className="form-label">
                    {label}
                </label>
            )}
            <div className="position-relative">
                {icon && (
                    <span
                        className="position-absolute top-50 translate-middle-y text-faint"
                        style={{ left: 14, pointerEvents: "none" }}
                    >
                        {icon}
                    </span>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    className={`form-control ${icon ? "ps-5" : ""} ${error ? "is-invalid" : ""} ${className}`.trim()}
                    style={trailing ? { paddingRight: 44 } : undefined}
                    {...rest}
                    onChange={handleChange}
                />
                {trailing && (
                    <span
                        className="position-absolute top-50 translate-middle-y"
                        style={{ right: 8 }}
                    >
                        {trailing}
                    </span>
                )}
            </div>
            {error ? (
                <div className="text-danger small mt-1">{error}</div>
            ) : (
                hint && <div className="form-text">{hint}</div>
            )}
        </div>
    );
});
