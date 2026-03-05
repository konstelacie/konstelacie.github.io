/**
 * StorageAdapter – namespaced localStorage for widget state.
 */

export const DRAFT_QUESTION_KEY = 'draft_question';

export function createStorageAdapter(namespace = 'pseudochat') {
  const prefix = (key) => `${namespace}_${key}`;

  return {
    get(key) {
      try {
        const v = localStorage.getItem(prefix(key));
        return v ? JSON.parse(v) : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(prefix(key), JSON.stringify(value));
      } catch (e) {
        console.warn('PseudoChat storage set failed:', e);
      }
    },
    remove(key) {
      localStorage.removeItem(prefix(key));
    },
    clear() {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(namespace + '_')) keys.push(k.replace(namespace + '_', ''));
      }
      keys.forEach((k) => this.remove(k));
    },
    getRaw(key) {
      return localStorage.getItem(prefix(key));
    },
    setRaw(key, value) {
      localStorage.setItem(prefix(key), value);
    },
  };
}
