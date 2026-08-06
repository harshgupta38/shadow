import MAIN_MOUNTAIN from "@/assets/main_goal_mountain.png";
import BOY_IMAGE from "@/assets/boy.png";
import GOT_IT_IMAGE from "@/assets/got_it.png";
import THINKING_IMAGE from "@/assets/thinking_it.png";

type GoalWizardVisualPlacement = {
    x: number;
    y: number;
    isFlipped: boolean;
    scale: number;
};

export type GoalWizardVisualMode = "journey" | "gotIt" | "thinking";

interface GoalWizardVisualProps {
    mode: GoalWizardVisualMode;
    boyStepIndex?: number;
    isBoyVisible?: boolean;
}

const MAIN_BACKGROUND = MAIN_MOUNTAIN;

const BOY_IMAGE_PLACEMENTS: GoalWizardVisualPlacement[] = [
    { x: 38, y: 71, isFlipped: false, scale: 1.0 },
    { x: 63, y: 61, isFlipped: true, scale: 0.8 },
    { x: 54, y: 55, isFlipped: false, scale: 0.7 },
    { x: 76, y: 46, isFlipped: true, scale: 0.5 },
    { x: 64, y: 39, isFlipped: false, scale: 0.4 },
];

const STATIC_VISUAL_IMAGES: Record<Exclude<GoalWizardVisualMode, "journey">, string> = {
    gotIt: GOT_IT_IMAGE,
    thinking: THINKING_IMAGE,
};

export function GoalWizardVisual({ mode, boyStepIndex = 0, isBoyVisible = true }: GoalWizardVisualProps) {
    const placement = BOY_IMAGE_PLACEMENTS[boyStepIndex] ?? BOY_IMAGE_PLACEMENTS[0];

    return (
        <aside className="goal-wizard-visual d-none d-xxl-block" aria-hidden="true">
            <div className="goal-wizard-visual-stage">
                {mode === "journey" ? (
                    <>
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
                                src={BOY_IMAGE}
                                alt=""
                                className={`goal-wizard-visual-boy-image ${placement.isFlipped ? "is-flipped" : ""}`.trim()}
                            />
                        </span>
                    </>
                ) : STATIC_VISUAL_IMAGES[mode] ? (
                    <div className={`goal-wizard-visual-poster is-${mode}`.trim()}>
                        <img src={STATIC_VISUAL_IMAGES[mode]} alt="" className="goal-wizard-visual-poster-image" />
                    </div>
                ) : null}
            </div>
        </aside>
    );
}