import { HeartPulseFill } from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";

export function WorkoutPage() {
  return (
    <div>
      <PageHeader title="Workout" subtitle="Coming soon" icon={<HeartPulseFill />} />
    </div>
  );
}
