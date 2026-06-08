import '@testing-library/jest-dom/vitest'

// Node 26 ships an experimental `localStorage` global that is unavailable
// without --localstorage-file and shadows the DOM environment's storage. Install
// a deterministic in-memory implementation so storage-backed code is testable
// and hermetic (each file gets a fresh instance; tests clear() in beforeEach).
class MemoryStorage implements Storage {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  clear() {
    this.m.clear()
  }
  getItem(key: string) {
    return this.m.has(key) ? this.m.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.m.set(key, String(value))
  }
  removeItem(key: string) {
    this.m.delete(key)
  }
  key(index: number) {
    return Array.from(this.m.keys())[index] ?? null
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
})
