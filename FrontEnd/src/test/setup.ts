import "@testing-library/jest-dom/vitest";

function ensureLocalStorageForTests(): void {
  try {
    const storage = window.localStorage;
    if (storage && typeof storage.clear === "function") return;
  } catch {
    // Fallback to in-memory shim below.
  }

  const memoryStore = new Map<string, string>();
  const storageShim: Storage = {
    get length() {
      return memoryStore.size;
    },
    clear() {
      memoryStore.clear();
    },
    getItem(key: string) {
      return memoryStore.has(key) ? memoryStore.get(key) ?? null : null;
    },
    key(index: number) {
      const keys = Array.from(memoryStore.keys());
      return keys[index] ?? null;
    },
    removeItem(key: string) {
      memoryStore.delete(key);
    },
    setItem(key: string, value: string) {
      memoryStore.set(key, String(value));
    },
  };

  Object.defineProperty(window, "localStorage", {
    value: storageShim,
    configurable: true,
  });
}

ensureLocalStorageForTests();

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
