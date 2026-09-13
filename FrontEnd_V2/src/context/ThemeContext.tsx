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

// ── Theme preference (localStorage) ──────────────────────────────────────────

const PREF_KEY = "shadow_theme_pref";

const VALID_PREFS = new Set<ThemePreference>(["browser", "dynamic", "light", "dark"]);

function readPref(): ThemePreference {
	try {
		const v = localStorage.getItem(PREF_KEY);
		if (v && VALID_PREFS.has(v as ThemePreference)) return v as ThemePreference;
	} catch {}
	return "browser"; // safe default — no geolocation request, no API call
}

function writePref(p: ThemePreference): void {
	try { localStorage.setItem(PREF_KEY, p); } catch {}
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

export interface DynamicInfo {
	scheduledTheme: EffectiveTheme; // what the API says right now (not affected by manual toggles)
	nextTransitionAt: string;       // ISO datetime of next sunrise/sunset switch
}

interface ThemeContextValue {
	effectiveTheme: EffectiveTheme;
	toggleTheme: () => void;
	themePreference: ThemePreference;
	setThemePreference: (preference: ThemePreference) => void;
	dynamicInfo: DynamicInfo | null;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: ChildProps) {
	const [themePreference, setThemePreference] = useState<ThemePreference>(readPref);

	// Seed initial theme from cache so there is no flash on load
	const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() => {
		const cached = readCache();
		return cached?.effectiveTheme ?? "light";
	});
	const [dynamicInfo, setDynamicInfo] = useState<DynamicInfo | null>(() => {
		const c = readCache();
		return c?.nextTransitionAt ? { scheduledTheme: c.effectiveTheme, nextTransitionAt: c.nextTransitionAt } : null;
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
		if (data.next_transition_at) {
			setDynamicInfo({ scheduledTheme: data.effective_theme, nextTransitionAt: data.next_transition_at });
		}

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
					setDynamicInfo(null);
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

	// Persist preference to localStorage whenever it changes (covers all sources:
	// theme:sync, settings save, toggleTheme, initial load).
	useEffect(() => {
		writePref(themePreference);
	}, [themePreference]);

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

	// Sync theme from backend — AuthContext dispatches "theme:sync" after every
	// api.auth.me() call (session restore, login, register, refreshUser).
	// If the backend preference differs from what's locally stored, apply it.
	useEffect(() => {
		function handleThemeSync(e: Event) {
			const pref = (e as CustomEvent<{ preference: ThemePreference }>).detail.preference;
			setThemePreference(pref); // React bails out if value is unchanged
		}
		window.addEventListener("theme:sync", handleThemeSync);
		return () => window.removeEventListener("theme:sync", handleThemeSync);
	}, []); // setThemePreference is a stable useState setter — no deps needed

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
		// intentionally do NOT touch dynamicInfo — the schedule is unchanged by a manual toggle
		setEffectiveTheme((current) => {
			const next: EffectiveTheme = current === "light" ? "dark" : "light";
			setThemePreference(next);
			return next;
		});
	}, []);

	const value = useMemo(
		() => ({ effectiveTheme, themePreference, setThemePreference, toggleTheme, dynamicInfo }),
		[effectiveTheme, themePreference, toggleTheme, dynamicInfo],
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
