import { LIMITS } from "@/constant/tuning";

export function resizeTextareaToMaxLines(
    textarea: HTMLTextAreaElement,
    maxLines: number = LIMITS.TEXTAREA_MAX_LINES,
    fallbackLineHeight: number = LIMITS.TEXTAREA_FALLBACK_LINE_HEIGHT,
): void {
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || fallbackLineHeight;
    const verticalPadding = Number.parseFloat(computedStyle.paddingTop) + Number.parseFloat(computedStyle.paddingBottom);
    const verticalBorder = Number.parseFloat(computedStyle.borderTopWidth) + Number.parseFloat(computedStyle.borderBottomWidth);
    const maxHeight = (lineHeight * maxLines) + verticalPadding + verticalBorder;

    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}
