export const performance = globalThis.performance ?? { now: () => Date.now() }
