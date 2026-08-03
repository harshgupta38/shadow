import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, ChildProps, DynamicThemeResponse, EffectiveTheme, ThemePreference } from "@/api";
import { getUserLocation } from "@/services/location.service";
import { DEFAULTS } from "@/constant/data";

interface ThemeContextValue {
	effectiveTheme: EffectiveTheme;
	toggleTheme: () => void;

	themePreference: ThemePreference;
	setThemePreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(effectiveTheme: EffectiveTheme): void {
	document.documentElement.setAttribute("data-bs-theme", effectiveTheme);
	document.documentElement.style.colorScheme = effectiveTheme;
}

function getBrowserTheme(): EffectiveTheme {
	if (typeof window !== "undefined" && window.matchMedia)
		return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	return "light";
}

async function fetchDynamicTheme(): Promise<DynamicThemeResponse> {
	const location = (await getUserLocation()) ?? DEFAULTS.DEFAULT_INDIAN_LOCATION;
	return api.theme.resolveDynamicTheme(location);
}

export function ThemeProvider({ children }: ChildProps) {
	const [themePreference, setThemePreference] = useState<ThemePreference>("browser");
	const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>("light");
	const [dynamicThemeInfo, setDynamicThemeInfo] = useState<DynamicThemeResponse | null>(null);

	const toggleTheme = useCallback(() => {
		setEffectiveTheme((current) =>
			current === "light" ? "dark" : "light"
		);
	}, []);

	const loadDynamicTheme = useCallback(async () => {
		try {
			const dynamicThemeInfo = await fetchDynamicTheme();
			setEffectiveTheme(dynamicThemeInfo.effective_theme);
			setDynamicThemeInfo(dynamicThemeInfo);
		} catch (error) {
			console.error("Failed to load dynamic theme.", error);
			setEffectiveTheme(getBrowserTheme());
		}
	}, []);

	useEffect(() => {
		setEffectiveTheme("light");
		// switch (themePreference) {
		// 	case "light":
		// 		setEffectiveTheme("light");
		// 		break;

		// 	case "dark":
		// 		setEffectiveTheme("dark");
		// 		break;

		// 	case "browser":
		// 		setEffectiveTheme(getBrowserTheme());
		// 		break;

		// 	case "dynamic":
		// 		loadDynamicTheme();
		// 		break;
		// }
	}, [themePreference, loadDynamicTheme]);

	useEffect(() => {
		applyTheme(effectiveTheme);
	}, [effectiveTheme]);

	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleThemeChange = () => {
			if (themePreference !== "browser") return;
			setEffectiveTheme(getBrowserTheme());
		};

		if (typeof mediaQuery.addEventListener === "function") {
			mediaQuery.addEventListener("change", handleThemeChange);
			return () => mediaQuery.removeEventListener("change", handleThemeChange);
		}

		mediaQuery.addListener(handleThemeChange); // For older browsers
		return () => mediaQuery.removeListener(handleThemeChange);
	}, [themePreference]);

	useEffect(() => {
		if (!dynamicThemeInfo)
			return;

		const nextTransition = new Date(dynamicThemeInfo.next_transition_at);
		const delay = nextTransition.getTime() - Date.now();

		if (delay <= 0) return;

		let timeoutId: ReturnType<typeof setTimeout>;
		timeoutId = setTimeout(() => {
			loadDynamicTheme();
		}, delay);
		return () => {
			clearTimeout(timeoutId);
		};

	}, [dynamicThemeInfo, loadDynamicTheme]);

	const value = useMemo(
		() => ({
			effectiveTheme,
			themePreference,
			setThemePreference,
			toggleTheme,
		}),
		[effectiveTheme, themePreference, toggleTheme]
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
