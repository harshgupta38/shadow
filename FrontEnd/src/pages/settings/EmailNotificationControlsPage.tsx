import { EnvelopePaperFill, Sliders } from "react-bootstrap-icons";

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";

export function EmailNotificationControlsPage() {
  return (
    <div>
      <PageHeader
        title="Email Notification Controls"
        subtitle="Control what lands in your inbox from Shadow."
        icon={<EnvelopePaperFill size={20} />}
      />

      <SectionCard>
        <div className="surface-2 p-4 d-flex flex-column gap-2">
          <div className="d-inline-flex align-items-center gap-2 fw-semibold">
            <Sliders size={16} /> Fine-grained controls coming next
          </div>
          <p className="text-muted-2 mb-0">
            This page is ready for the upcoming step where we will define exactly which email categories
            to send and when.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
