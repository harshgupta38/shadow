import { useEffect, useState } from "react";

import "./AssistantThinkingIndicator.scss";

// const PHRASES = [
//   "Thinking",
//   "Contemplating",
//   "Analyzing",
//   "Connecting the dots",
//   "Working on it",
//   "Processing",
//   "Cooking something up",
//   "Almost there",
// ];

const PHRASES = [
  "Thinking",
  "Connecting the dots",
  "Working through it",
  "Looking at the bigger picture",
  "Exploring the possibilities",
  "Putting the pieces together",
  "Finding a good approach",
  "Making sense of it",
  "Almost there",
];

export function AssistantThinkingIndicator() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex(i => (i + 1) % PHRASES.length);
        setVisible(true);
      }, 280);
    }, 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="ast-thinking" role="status" aria-label="Assistant is thinking">
      <span className="ast-thinking-icon" aria-hidden="true">✦</span>
      <span className="ast-thinking-text-wrap" aria-hidden="true">
        <span className={`ast-thinking-text${visible ? " is-visible" : ""}`}>
          {PHRASES[index]}…
        </span>
      </span>
    </div>
  );
}
