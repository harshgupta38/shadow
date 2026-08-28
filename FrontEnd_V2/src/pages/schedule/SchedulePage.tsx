import { CalendarWeek, PlusLg } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ROUTES } from "@/routes/RoutePaths";
import "@/pages/schedule/SchedulePage.scss";

export function SchedulePage() {
  const navigate = useNavigate();

  return (
    <section className="schedule-page">
      <PageHeader
        title="Schedule"
        subtitle="Plan one-time commitments and never lose track of them."
        icon={<CalendarWeek size={20} />}
        actions={[
          {
            key: "schedule-task",
            label: "Schedule Task",
            icon: <PlusLg size={14} />,
            tone: "brand",
            onClick: () => navigate(ROUTES.SCHEDULE_CREATE),
          },
        ]}
      />
    </section>
  );
}
