import { JournalRichtext } from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ComingSoonState } from "@/components/ui/ComingSoonState/ComingSoonState";

export function JournalPage() {
  return (
    <div>
      <PageHeader title="Journal" subtitle="Coming soon" icon={<JournalRichtext />} />
      <ComingSoonState
        title="Journal is on its way"
        text="We're building a space for you to reflect and jot down your thoughts. Check back soon!"
      />
    </div>
  );
}
