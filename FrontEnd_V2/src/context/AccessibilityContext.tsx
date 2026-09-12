import { createContext, useContext, useEffect, useState } from "react";

import { type AccessibilitySettings, type ChildProps } from "@/api";

const DEFAULT: AccessibilitySettings = {
  accessibility_reduced_motion: false,
  accessibility_high_contrast: false,
  accessibility_font_scale_percent: 100,
};

function readCache(): AccessibilitySettings {
  try {
    const v = localStorage.getItem("shadow_accessibility");
    if (v) return { ...DEFAULT, ...(JSON.parse(v) as Partial<AccessibilitySettings>) };
  } catch {}
  return { ...DEFAULT };
}

function applyToDOM(s: AccessibilitySettings): void {
  const root = document.documentElement;
  root.setAttribute("data-reduced-motion", String(s.accessibility_reduced_motion));
  root.setAttribute("data-high-contrast", String(s.accessibility_high_contrast));
  root.style.setProperty("--shadow-font-scale-percent", String(s.accessibility_font_scale_percent));
}

interface AccessibilityContextValue {
  accessibility: AccessibilitySettings;
}

const AccessibilityContext = createContext<AccessibilityContextValue | undefined>(undefined);

export function AccessibilityProvider({ children }: ChildProps) {
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>(() => {
    const cached = readCache();
    applyToDOM(cached);
    return cached;
  });

  useEffect(() => {
    function handler(e: Event) {
      const s = (e as CustomEvent<AccessibilitySettings>).detail;
      setAccessibility(s);
      applyToDOM(s);
      try {
        localStorage.setItem("shadow_accessibility", JSON.stringify(s));
      } catch {}
    }
    window.addEventListener("accessibility:sync", handler);
    return () => window.removeEventListener("accessibility:sync", handler);
  }, []);

  return (
    <AccessibilityContext.Provider value={{ accessibility }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilitySettings {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error("useAccessibility must be used within an AccessibilityProvider");
  return ctx.accessibility;
}
