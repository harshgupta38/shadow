import type { ReactNode } from "react";
import { ChevronDown } from "react-bootstrap-icons";

interface PlanCollapsePanelProps {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * A list under Today's Plan that stays closed until it is opened (Completed, Skipped): a header with the count, and the cards below it.
 * Its styles are the `completed-panel` ones in PlanPage.scss, named from when Completed was the only such list.
 */
export function PlanCollapsePanel({ title, count, open, onToggle, children }: PlanCollapsePanelProps) {
  return (
    <section className="plan-panel completed-panel">
      <button type="button" className="completed-panel-header" onClick={onToggle} aria-expanded={open}>
        <span className="completed-panel-title">{title}</span>
        <span className="completed-panel-count">{count}</span>
        <ChevronDown className={`completed-panel-chevron${open ? " is-open" : ""}`} size={15} />
      </button>
      <div className={`completed-panel-collapse${open ? " is-open" : ""}`}>
        <div className="completed-panel-collapse-inner">
          <div className="plan-task-list mt-0">{children}</div>
        </div>
      </div>
    </section>
  );
}
