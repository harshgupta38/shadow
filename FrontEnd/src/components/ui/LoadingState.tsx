import { Spinner } from "react-bootstrap";

interface LoadingStateProps {
  label?: string;
  /** Fill the vertical space of a page section. */
  full?: boolean;
}

export function LoadingState({ label = "Loading…", full = true }: LoadingStateProps) {
  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center gap-3 text-muted-2"
      style={full ? { minHeight: "40vh" } : { padding: "2rem 0" }}
    >
      <Spinner animation="border" className="spinner-brand" role="status" />
      <span className="small fw-medium">{label}</span>
    </div>
  );
}
