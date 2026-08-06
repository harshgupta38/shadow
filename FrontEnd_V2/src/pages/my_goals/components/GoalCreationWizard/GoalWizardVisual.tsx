import MAIN_MOUNTAIN from "@/assets/main_goal_mountain.png";
import BOY_IMAGE from "@/assets/boy.png";

type GoalWizardVisualPlacement = {
    x: number;
    y: number;
    isFlipped: boolean;
    scale: number;
};

interface GoalWizardVisualProps {
    boyStepIndex: number;
    isBoyVisible: boolean;
}

const MAIN_BACKGROUND = MAIN_MOUNTAIN;
const BOY_FOREGROUND = BOY_IMAGE;

const BOY_IMAGE_PLACEMENTS: GoalWizardVisualPlacement[] = [
    { x: 38, y: 71, isFlipped: false, scale: 1.0 },
    { x: 63, y: 61, isFlipped: true, scale: 0.8 },
    { x: 54, y: 55, isFlipped: false, scale: 0.7 },
    { x: 76, y: 46, isFlipped: true, scale: 0.5 },
    { x: 64, y: 39, isFlipped: false, scale: 0.4 },
];

export function GoalWizardVisual({ boyStepIndex, isBoyVisible }: GoalWizardVisualProps) {
    const placement = BOY_IMAGE_PLACEMENTS[boyStepIndex] ?? BOY_IMAGE_PLACEMENTS[0];

    return (
        <aside className="goal-wizard-visual d-none d-xxl-block" aria-hidden="true">
            <div className="goal-wizard-visual-stage">
                <img src={MAIN_BACKGROUND} alt="" className="goal-wizard-visual-image" />
                <span
                    className="goal-wizard-visual-boy"
                    style={{
                        left: `${placement.x}%`,
                        top: `${placement.y}%`,
                        transform: `translate(-50%, -50%) scale(${placement.scale})`,
                        opacity: isBoyVisible ? 1 : 0,
                    }}
                >
                    <img
                        src={BOY_FOREGROUND}
                        alt=""
                        className={`goal-wizard-visual-boy-image ${placement.isFlipped ? "is-flipped" : ""}`.trim()}
                    />
                </span>
            </div>
        </aside>
    );
}