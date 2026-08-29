import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "react-bootstrap-icons";

import "./FilterDropdown.scss";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FilterSectionConfig {
    key: string;
    label: string;
    options: ReadonlyArray<{ value: string; label: string }>;
    selected: string[];
    onToggle: (value: string) => void;
    /** When true, clicking an already-active chip is a no-op (radio/single-select behavior). */
    single?: boolean;
}

export interface FilterDropdownProps {
    sections: FilterSectionConfig[];
    onReset: () => void;
    /** Button label. Default: "Filters" */
    label?: string;
    /** Dropdown width in px. Default: 300 */
    width?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FilterDropdown({
    sections,
    onReset,
    label = "Filters",
    width = 300,
}: FilterDropdownProps) {
    const uid = useId();
    const dropdownId = `jv-filter-dropdown-${uid}`;
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    function computePos() {
        if (!btnRef.current) return null;
        const rect = btnRef.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const dropW = Math.min(width, vw - 16);
        const left = Math.max(8, Math.min(rect.right - dropW, vw - dropW - 8));
        return { top: rect.bottom + 6, left, width: dropW };
    }

    function toggle() {
        if (!open) {
            const p = computePos();
            if (p) setPos(p);
        }
        setOpen(v => !v);
    }

    useEffect(() => {
        if (!open) return;

        function onClickOutside(e: MouseEvent) {
            if (
                btnRef.current && !btnRef.current.contains(e.target as Node) &&
                (!dropdownRef.current || !dropdownRef.current.contains(e.target as Node))
            ) setOpen(false);
        }

        function reposition() {
            if (!btnRef.current) { setOpen(false); return; }
            const rect = btnRef.current.getBoundingClientRect();
            const vw = window.innerWidth;
            const dropW = Math.min(width, vw - 16);
            const left = Math.max(8, Math.min(rect.right - dropW, vw - dropW - 8));
            setPos({ top: rect.bottom + 6, left, width: dropW });
        }

        document.addEventListener("mousedown", onClickOutside);
        window.addEventListener("scroll", reposition, true);
        window.addEventListener("resize", reposition);
        return () => {
            document.removeEventListener("mousedown", onClickOutside);
            window.removeEventListener("scroll", reposition, true);
            window.removeEventListener("resize", reposition);
        };
    }, [open, width]);

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={`jv-filter-btn${open ? " jv-filter-btn--open" : ""}`}
                onClick={toggle}
                aria-expanded={open}
                aria-controls={dropdownId}
                onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}
            >
                {label}
                <ChevronDown size={12} className={`jv-filter-chevron${open ? " jv-filter-chevron--up" : ""}`} />
            </button>

            {open && pos && createPortal(
                <div
                    ref={dropdownRef}
                    id={dropdownId}
                    className="jv-filter-dropdown"
                    style={{ top: pos.top, left: pos.left, width: pos.width }}
                >
                    {sections.map(section => (
                        <div key={section.key} className="jv-filter-section">
                            <p className="jv-filter-label">{section.label}</p>
                            <div className="jv-filter-chips">
                                {section.options.map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        className={`jv-chip${section.selected.includes(opt.value) ? " jv-chip--active" : ""}`}
                                        onClick={() => {
                                            if (section.single && section.selected.includes(opt.value)) return;
                                            section.onToggle(opt.value);
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    <div className="jv-filter-reset">
                        <button type="button" className="jv-filter-reset-btn" onClick={onReset}>
                            Reset filters
                        </button>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
