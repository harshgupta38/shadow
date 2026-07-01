import "@testing-library/jest-dom/vitest";

// jsdom does not implement matchMedia — several components (theme detection,
// responsive helpers) rely on it, so provide a lightweight stub.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
