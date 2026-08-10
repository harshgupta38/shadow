const IRREGULAR_PLURAL_TO_SINGULAR: Record<string, string> = {
    people: "person",
    men: "man",
    women: "woman",
    children: "child",
    teeth: "tooth",
    feet: "foot",
    mice: "mouse",
    geese: "goose",
};

export function singularizeWord(word: string): string {
    const trimmed = word.trim();
    if (!trimmed) return word;

    const lower = trimmed.toLowerCase();
    if (IRREGULAR_PLURAL_TO_SINGULAR[lower]) {
        return IRREGULAR_PLURAL_TO_SINGULAR[lower];
    }

    if (lower.endsWith("ies") && lower.length > 3) {
        return `${trimmed.slice(0, -3)}y`;
    }

    if (
        lower.endsWith("ses")
        || lower.endsWith("xes")
        || lower.endsWith("zes")
        || lower.endsWith("ches")
        || lower.endsWith("shes")
    ) {
        return trimmed.slice(0, -2);
    }

    if (lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 1) {
        return trimmed.slice(0, -1);
    }

    return trimmed;
}

export function isPluralWord(word: string): boolean {
    const trimmed = word.trim();
    if (!trimmed) return false;
    return singularizeWord(trimmed).toLowerCase() !== trimmed.toLowerCase();
}

export function checkAndConvertPluralWord(word: string): { isPlural: boolean; singular: string } {
    const singular = singularizeWord(word);
    return {
        isPlural: singular.toLowerCase() !== word.trim().toLowerCase(),
        singular,
    };
}
