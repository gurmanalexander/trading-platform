/**
 * Интерфейс расширений браузера. В Firefox он называется browser, в Chrome и остальных — chrome;
 * в остальном нужные мосту части совпадают.
 */
const g = globalThis as unknown as { browser?: typeof chrome; chrome: typeof chrome }
export const ext: typeof chrome = g.browser ?? g.chrome
