import { useEffect, useState } from "react";

import "./StepImageVisual.scss";

interface StepImageVisualProps {
	images: string[];
	activeIndex: number;
}

const VISUAL_TRANSITION_MS = 260; // also update in StepImageVisual.scss transition duration when changing this value

function clampIndex(index: number, length: number): number {
	if (length <= 0) {
		return 0;
	}

	return Math.min(Math.max(index, 0), length - 1);
}

export function StepImageVisual({ images, activeIndex }: StepImageVisualProps) {
	const safeIndex = clampIndex(activeIndex, images.length);
	const [displayIndex, setDisplayIndex] = useState(safeIndex);
	const [previousIndex, setPreviousIndex] = useState<number | null>(null);

	useEffect(() => {
		if (safeIndex === displayIndex) {
			return;
		}

		setPreviousIndex(displayIndex);
		setDisplayIndex(safeIndex);

		const timer = window.setTimeout(() => {
			setPreviousIndex(null);
		}, VISUAL_TRANSITION_MS);

		return () => {
			window.clearTimeout(timer);
		};
	}, [displayIndex, safeIndex]);

	if (images.length === 0) {
		return null;
	}

	const visualIndexes = [previousIndex, displayIndex].filter((value): value is number => value !== null);

	return (
		<aside className="step-image-visual d-none d-xxl-block" aria-hidden="true">
			<div className="step-image-visual-stage">
				{visualIndexes.map((index) => {
					const isActive = index === displayIndex;

					return (
						<div
							key={`${images[index]}-${index}`}
							className={`step-image-visual-layer ${isActive ? "is-active" : "is-exiting"}`.trim()}
						>
							<img src={images[index]} alt="" className="step-image-visual-poster-image" />
						</div>
					);
				})}
			</div>
		</aside>
	);
}