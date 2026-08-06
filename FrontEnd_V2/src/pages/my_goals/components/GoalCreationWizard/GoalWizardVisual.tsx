import { useEffect, useState } from "react";

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

export type GoalWizardVisualMode = "journey" | "thinking" | "gotIt";

interface GoalWizardVisualProps {
    mode: GoalWizardVisualMode;
    boyStepIndex: number;
    isBoyVisible: boolean;
}

const MAIN_BACKGROUND = MAIN_MOUNTAIN;
const BOY_FOREGROUND = BOY_IMAGE;
const THINKING_FOREGROUND = THINKING_IMAGE;
const GOT_IT_FOREGROUND = GOT_IT_IMAGE;
const VISUAL_TRANSITION_MS = 420;

const BOY_IMAGE_PLACEMENTS: GoalWizardVisualPlacement[] = [
    { x: 38, y: 71, isFlipped: false, scale: 1.0 },
    { x: 63, y: 61, isFlipped: true, scale: 0.8 },
    { x: 54, y: 55, isFlipped: false, scale: 0.7 },
    { x: 76, y: 46, isFlipped: true, scale: 0.5 },
    { x: 64, y: 39, isFlipped: false, scale: 0.4 },
];

export function GoalWizardVisual({ mode, boyStepIndex, isBoyVisible }: GoalWizardVisualProps) {
    const placement = BOY_IMAGE_PLACEMENTS[boyStepIndex] ?? BOY_IMAGE_PLACEMENTS[0];
    const [displayMode, setDisplayMode] = useState<GoalWizardVisualMode>(mode);
    const [previousMode, setPreviousMode] = useState<GoalWizardVisualMode | null>(null);

    useEffect(() => {
        if (mode === displayMode) {
            return;
        }

        setPreviousMode(displayMode);
        setDisplayMode(mode);

        const timer = window.setTimeout(() => {
            setPreviousMode(null);
        }, VISUAL_TRANSITION_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [mode, displayMode]);

    const visualModes = [previousMode, displayMode].filter((item): item is GoalWizardVisualMode => item !== null);

    return (
        <aside className="goal-wizard-visual d-none d-xxl-block" aria-hidden="true">
            <div className="goal-wizard-visual-stage">
                {visualModes.map((visualMode) => {
                    const isActive = visualMode === displayMode;
                    const isJourney = visualMode === "journey";

                    return (
                        <div
                            key={visualMode}
                            className={`goal-wizard-visual-layer goal-wizard-visual-layer-${visualMode} ${isActive ? "is-active" : "is-exiting"}`.trim()}
                        >
                            {isJourney ? (
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
                                            src={BOY_FOREGROUND}
                                            alt=""
                                            className={`goal-wizard-visual-boy-image ${placement.isFlipped ? "is-flipped" : ""}`.trim()}
                                        />
                                    </span>
                                </>
                            ) : visualMode === "thinking" ? (
                                <img src={THINKING_FOREGROUND} alt="" className="goal-wizard-visual-poster-image" />
                            ) : (
                                <img src={GOT_IT_FOREGROUND} alt="" className="goal-wizard-visual-poster-image" />
                            )}
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}