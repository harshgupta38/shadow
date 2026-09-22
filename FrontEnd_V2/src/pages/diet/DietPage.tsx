import { EggFried } from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ComingSoonState } from "@/components/ui/ComingSoonState/ComingSoonState";

export function DietPage() {
  return (
    <div>
      <PageHeader title="Diet" subtitle="Coming soon" icon={<EggFried />} />
      <ComingSoonState
        title="Diet tracking is on its way"
        text="We're building tools to plan meals and track your nutrition. Check back soon!"
      />
    </div>
  );
}
