import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { api, type ChildProps, type EffectiveTheme, type ThemePreference } from "@/api";
import { DEFAULTS } from "@/constant/data";
import { getUserLocation } from "@/services/location.service";

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyTheme(effectiveTheme: EffectiveTheme): void {
	const root = document.documentElement;
	root.classList.add("theme-transitioning");
	void root.offsetHeight; // force repaint so the browser captures the "before" state
	root.setAttribute("data-bs-theme", effectiveTheme);
	root.style.colorScheme = effectiveTheme;
	window.setTimeout(() => root.classList.remove("theme-transitioning"), 350);
}

function getBrowserTheme(): EffectiveTheme {
	if (typeof window !== "undefined" && window.matchMedia)
		return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	return "light";
}

// ── Context ───────────────────────────────────────────────────────────────────

interface ThemeContextValue {
	effectiveTheme: EffectiveTheme;
	toggleTheme: () => void;
	themePreference: ThemePreference;
	setThemePreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: ChildProps) {
	const [themePreference, setThemePreference] = useState<ThemePreference>("dynamic");
	const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>("light");

	// Ref so the async loadDynamicTheme can check if preference changed mid-flight
	const isDynamic = useRef(true);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const loadDynamicTheme = useCallback(async () => {
		try {
			const location = (await getUserLocation()) ?? DEFAULTS.DEFAULT_INDIAN_LOCATION;
			if (!isDynamic.current) return; // preference changed while we were fetching location

			const data = await api.theme.resolveDynamicTheme(location);
			if (!isDynamic.current) return; // preference changed while awaiting API

			setEffectiveTheme(data.effective_theme);

			const delay = new Date(data.next_transition_at).getTime() - Date.now();
			if (delay > 0) {
				timerRef.current = setTimeout(loadDynamicTheme, delay);
			}
		} catch {
			if (isDynamic.current) {
				// API unavailable — fall back to OS theme
				setEffectiveTheme(getBrowserTheme());
			}
		}
	}, []);

	// Apply theme to DOM whenever effectiveTheme changes
	useEffect(() => {
		applyTheme(effectiveTheme);
	}, [effectiveTheme]);

	// React to preference changes
	useEffect(() => {
		isDynamic.current = themePreference === "dynamic";
		clearTimer();

		switch (themePreference) {
			case "light":
				setEffectiveTheme("light");
				break;

			case "dark":
				setEffectiveTheme("dark");
				break;

			case "browser":
				setEffectiveTheme(getBrowserTheme());
				break;

			case "dynamic":
				loadDynamicTheme();
				break;
		}

		return clearTimer; // cancel pending timer if preference changes again
	}, [themePreference, loadDynamicTheme, clearTimer]);

	// Track OS theme changes when preference is "browser"
	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => {
			if (themePreference !== "browser") return;
			setEffectiveTheme(getBrowserTheme());
		};
		if (typeof mq.addEventListener === "function") {
			mq.addEventListener("change", handler);
			return () => mq.removeEventListener("change", handler);
		}
		mq.addListener(handler); // legacy browsers
		return () => mq.removeListener(handler);
	}, [themePreference]);

	// Toggling pins the user to a fixed light/dark preference so dynamic
	// auto-transitions no longer override their choice.
	const toggleTheme = useCallback(() => {
		setEffectiveTheme((current) => {
			const next: EffectiveTheme = current === "light" ? "dark" : "light";
			setThemePreference(next);
			return next;
		});
	}, []);

	const value = useMemo(
		() => ({ effectiveTheme, themePreference, setThemePreference, toggleTheme }),
		[effectiveTheme, themePreference, toggleTheme],
	);

	return (
		<ThemeContext.Provider value={value}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
	return ctx;
}
