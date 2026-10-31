import { useEffect, useRef, useState } from "react";

import { ANIMATION } from "@/constant/tuning";

/**
 * Moves the boy along the journey picture to the open step, the way GoalCreationWizard does. A backward jump of more
 * than one step fades him out and back in; any other move walks him across the steps in between.
 */
export function useWizardBoy(currentStepIndex: number) {
  const [boyStepIndex, setBoyStepIndex] = useState(0);
  const [isBoyVisible, setIsBoyVisible] = useState(true);
  const stepTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);

  function clearStepTimer() {
    if (stepTimerRef.current !== null) {
      window.clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }

  function clearFadeTimer() {
    if (fadeTimerRef.current !== null) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }

  useEffect(() => {
    clearStepTimer();
    clearFadeTimer();

    if (boyStepIndex === currentStepIndex) {
      setIsBoyVisible(true);
      return;
    }

    const distance = Math.abs(currentStepIndex - boyStepIndex);
    const isBackwardMultiStepJump = currentStepIndex < boyStepIndex && distance > 1;

    if (isBackwardMultiStepJump) {
      setIsBoyVisible(false);
      fadeTimerRef.current = window.setTimeout(() => {
        setBoyStepIndex(currentStepIndex);
        setIsBoyVisible(true);
        clearFadeTimer();
      }, ANIMATION.BOY_BACKWARD_FADE_MS);

      return () => clearFadeTimer();
    }

    if (distance === 1) {
      setIsBoyVisible(true);
      setBoyStepIndex(currentStepIndex);
      return;
    }

    const direction = currentStepIndex > boyStepIndex ? 1 : -1;
    setIsBoyVisible(true);

    stepTimerRef.current = window.setInterval(() => {
      setBoyStepIndex((current) => {
        const next = current + direction;
        if (next === currentStepIndex) clearStepTimer();
        return next;
      });
    }, ANIMATION.BOY_MULTI_STEP_INTERVAL_MS);

    return () => {
      clearStepTimer();
      clearFadeTimer();
    };
    // The effect reads the boy's position as it was when the step changed, which is what the walk starts from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStepIndex]);

  return { boyStepIndex, isBoyVisible };
}
