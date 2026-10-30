import type { MuscleId } from "@/api/types";
import { MuscleMap } from "@/pages/workout/MuscleMap/MuscleMap";
import "./MusclePicker.scss";

interface MusclePickerProps {
  selected: MuscleId | null;
  onSelect: (muscle: MuscleId) => void;
  onClear: () => void;
}

// The body to tap. The muscle chips above the cards pick the same muscles, so every muscle can be reached either way.
export function MusclePicker({ selected, onSelect, onClear }: MusclePickerProps) {
  return (
    <section className="surface wk-mp" aria-label="Choose muscles">
      <header className="wk-mp-head">
        <h3>Choose muscles</h3>
        {selected ? (
          <button type="button" className="wk-mp-clear" onClick={onClear}>
            Show all
          </button>
        ) : (
          <span className="wk-mp-hint">Tap a muscle to filter</span>
        )}
      </header>

      <div className="wk-mp-map">
        <MuscleMap primary={[]} selected={selected} onSelect={onSelect} view="both" size="md" />
      </div>
    </section>
  );
}
