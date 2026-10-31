import { useState } from "react";
import { XLg } from "react-bootstrap-icons";

import "./ChipInput.scss";

interface ChipInputProps {
  id: string;
  label: string;
  hint?: string;
  values: string[];
  placeholder?: string;
  /** The most entries the server accepts. */
  max?: number;
  onChange: (values: string[]) => void;
}

/** A short list of words: type one, press Enter or comma to add it, click × to remove it. */
export function ChipInput({ id, label, hint, values, placeholder, max = 30, onChange }: ChipInputProps) {
  const [draft, setDraft] = useState("");

  // Handles one word or a pasted list ("a, b, c" or one per line).
  const commit = (raw: string) => {
    const words = raw.split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
    const next = [...values];
    for (const word of words) {
      if (next.length >= max) break;
      if (!next.some((v) => v.toLowerCase() === word.toLowerCase())) next.push(word.slice(0, 60));
    }
    if (next.length !== values.length) onChange(next);
    setDraft("");
  };

  return (
    <div className="dt-chips">
      <label htmlFor={id} className="form-label">{label}</label>
      {values.length > 0 && (
        <ul className="dt-chips-list" aria-label={label}>
          {values.map((value) => (
            <li key={value} className="dt-chip">
              {value}
              <button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((v) => v !== value))}>
                <XLg size={10} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        className="form-control"
        value={draft}
        placeholder={placeholder}
        maxLength={600} /* long enough to paste a list; each entry is trimmed to 60 */
        onChange={(e) => (/[,\n]/.test(e.target.value) ? commit(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return; // Enter while composing text (IME) picks a character, it is not "add"
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
      />
      {hint && <div className="form-text">{hint}{values.length >= max ? ` You've reached the limit of ${max}.` : ""}</div>}
    </div>
  );
}
