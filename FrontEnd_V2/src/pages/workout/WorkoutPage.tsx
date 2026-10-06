import { HeartPulseFill } from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ComingSoonState } from "@/components/ui/ComingSoonState/ComingSoonState";

export function WorkoutPage() {
  return (
    <div>
      <PageHeader title="Workout" subtitle="Build a routine you can actually stick to." icon={<HeartPulseFill />} />
      <ComingSoonState
        title="Workout tracking is on its way"
        text="We're building tools to plan, log, and track your workouts. Check back soon!"
      />
    </div>
  );
}
