import { CheckCircleFill, Circle } from "react-bootstrap-icons";

export const PASSWORD_RULES = [
    { label: "8+ characters",     test: (p: string) => p.length >= 8 },
    { label: "Uppercase letter",  test: (p: string) => /[A-Z]/.test(p) },
    { label: "Number",            test: (p: string) => /[0-9]/.test(p) },
    { label: "Special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

const STRENGTH_META = [
    { label: "Weak",   color: "var(--jv-danger)"  },
    { label: "Fair",   color: "var(--jv-warn)"    },
    { label: "Good",   color: "var(--jv-brand-2)" },
    { label: "Strong", color: "var(--jv-success)" },
] as const;

export function PasswordStrength({ password }: { password: string }) {
    if (!password) return null;
    const score = PASSWORD_RULES.filter(r => r.test(password)).length;
    const { label, color } = STRENGTH_META[Math.max(0, score - 1)];

    return (
        <div className="pw-strength">
            <div className="pw-strength-bar-row">
                <div className="pw-strength-track">
                    <div className="pw-strength-fill" style={{ width: `${score * 25}%`, background: color }} />
                </div>
                {score > 0 && (
                    <span className="pw-strength-label" style={{ color }}>{label}</span>
                )}
            </div>
            <div className="password-rules">
                {PASSWORD_RULES.map(({ label: ruleLabel, test }) => {
                    const met = test(password);
                    return (
                        <span key={ruleLabel} className={`password-rule${met ? " password-rule--met" : ""}`}>
                            {met ? <CheckCircleFill size={11} /> : <Circle size={11} />}
                            {ruleLabel}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
