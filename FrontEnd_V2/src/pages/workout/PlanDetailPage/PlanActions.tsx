import { DESKTOP_TONE_CLASS, type PageHeaderAction } from "@/components/ui/PageHeader/PageHeader";

/** The plan's actions as buttons in two columns, for the wide layout where they sit under the muscle charts instead of in the page header. */
export function PlanActions({ actions }: { actions: PageHeaderAction[] }) {
  return (
    <div className="row row-cols-2 g-2" role="group" aria-label="Plan actions">
      {actions.map((action) => (
        <div className="col" key={action.key}>
          <button
            type="button"
            className={`btn btn-sm w-100 d-flex align-items-center justify-content-center gap-2 ${DESKTOP_TONE_CLASS[action.tone ?? "soft"]}`}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.icon}
            {action.label}
          </button>
        </div>
      ))}
    </div>
  );
}
