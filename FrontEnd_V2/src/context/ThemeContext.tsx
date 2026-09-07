import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { api, tokenStore, type ChildProps, type EffectiveTheme, type ThemePreference } from "@/api";
import { DEFAULTS } from "@/constant/data";
import { getUserLocation } from "@/services/location.service";

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyTheme(effectiveTheme: EffectiveTheme, skipTransition = false): void {
	const root = document.documentElement;
	if (!skipTransition) {
		root.classList.add("theme-transitioning");
		void root.offsetHeight; // force repaint so the browser captures the "before" state
	}
	root.setAttribute("data-bs-theme", effectiveTheme);
	root.style.colorScheme = effectiveTheme;
	if (!skipTransition) {
		window.setTimeout(() => root.classList.remove("theme-transitioning"), 350);
	}
}

function getBrowserTheme(): EffectiveTheme {
	if (typeof window !== "undefined" && window.matchMedia)
		return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	return "light";
}

// ── Dynamic theme cache (localStorage) ───────────────────────────────────────

const CACHE_KEY = "dynamic_theme_cache";

interface DynamicThemeCache {
	effectiveTheme: EffectiveTheme;
	nextTransitionAt: string; // ISO datetime
}

function readCache(): DynamicThemeCache | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		return raw ? (JSON.parse(raw) as DynamicThemeCache) : null;
	} catch {
		return null;
	}
}

function writeCache(effectiveTheme: EffectiveTheme, nextTransitionAt: string | null): void {
	if (!nextTransitionAt) return; // nothing to schedule against — don't cache a stale-forever entry
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify({ effectiveTheme, nextTransitionAt }));
	} catch {
		// storage quota exceeded or private mode — silently ignore
	}
}

function clearCache(): void {
	try {
		localStorage.removeItem(CACHE_KEY);
	} catch {
		// ignore
	}
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

	// Seed initial theme from cache so there is no flash on load
	const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() => {
		const cached = readCache();
		return cached?.effectiveTheme ?? "light";
	});

	// Ref so the async loadDynamicTheme can check if preference changed mid-flight
	const isDynamic = useRef(true);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isInitialMount = useRef(true);

	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const fetchAndCache = useCallback(async () => {
		const location = (await getUserLocation()) ?? DEFAULTS.DEFAULT_INDIAN_LOCATION;
		if (!isDynamic.current) return;

		const data = await api.theme.resolveDynamicTheme(location);
		if (!isDynamic.current) return;

		writeCache(data.effective_theme, data.next_transition_at);
		setEffectiveTheme(data.effective_theme);

		return data.next_transition_at;
	}, []);

	const loadDynamicTheme = useCallback(async () => {
		try {
			let nextTransitionAt: string | null | undefined;

			const cached = readCache();
			const now = Date.now();

			if (cached && new Date(cached.nextTransitionAt).getTime() > now) {
				// Cache is still valid — apply cached theme and wait for transition
				setEffectiveTheme(cached.effectiveTheme);
				nextTransitionAt = cached.nextTransitionAt;
			} else {
				// No cache or transition time has passed — fetch fresh data
				if (!tokenStore.get()) {
					// Not signed in — skip the protected endpoint to avoid a 401
					setEffectiveTheme(getBrowserTheme());
					return;
				}
				nextTransitionAt = await fetchAndCache();
			}

			if (!nextTransitionAt) return;

			const delay = new Date(nextTransitionAt).getTime() - Date.now();
			if (delay > 0) {
				// At transition time: clear cache so we fetch fresh theme+next transition
				timerRef.current = setTimeout(() => {
					clearCache();
					loadDynamicTheme();
				}, delay);
			}
		} catch {
			if (isDynamic.current) {
				// API unavailable — fall back to OS theme
				setEffectiveTheme(getBrowserTheme());
			}
		}
	}, [fetchAndCache]);

	// Apply theme to DOM whenever effectiveTheme changes
	useEffect(() => {
		applyTheme(effectiveTheme, isInitialMount.current);
		isInitialMount.current = false;
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

	// After login, retry dynamic theme if we previously fell back to browser theme
	useEffect(() => {
		const handleLogin = () => {
			if (themePreference !== "dynamic") return;
			const cached = readCache();
			if (cached && new Date(cached.nextTransitionAt).getTime() > Date.now()) return;
			loadDynamicTheme();
		};
		window.addEventListener("auth:login", handleLogin);
		return () => window.removeEventListener("auth:login", handleLogin);
	}, [themePreference, loadDynamicTheme]);

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
		clearCache(); // manual override — don't let a stale cached theme win on next load
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
