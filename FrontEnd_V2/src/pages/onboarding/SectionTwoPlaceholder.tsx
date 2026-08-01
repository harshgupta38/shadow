import { ChatDots, Stars } from "react-bootstrap-icons";

export function SectionTwoPlaceholder() {
    return (
        <section className="surface p-4 p-md-5">
            <div className="d-flex gap-3 mb-3 align-items-center">
                <span className="brand-mark" style={{ width: 40, height: 40, flexShrink: 0 }}>
                    <ChatDots size={20} />
                </span>
                <div>
                    <h2 className="h4 fw-bold mb-1">Section 2: Interview</h2>
                    <p className="text-muted-2 mb-0">Foundation saved. This is where backend-driven questions will appear next.</p>
                </div>
            </div>

            <div className="surface-2 p-3 p-md-4">
                <div className="d-flex align-items-center gap-2 text-muted-2 small fw-semibold mb-2">
                    <Stars size={14} /> Ready for backend question flow
                </div>
                <p className="mb-0">
                    We will now render question_type, question, hint, can_skip, and options from backend responses.
                </p>
            </div>
        </section>
    );
}
