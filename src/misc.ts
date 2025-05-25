import * as fs from 'fs'

export const fileExists = async (path: string) => !!(await fs.promises.stat(path).catch(_ => false))

export function assert(v: any, msg?: string): asserts v {
    if (!v) throw new Error(`Assertion error${msg ? `: ${msg}` : ''}`)
}

declare global {
    interface Array<T> {
        last(): T
    }
}
Array.prototype.last = function (this: []) {
    return this[this.length - 1]
}
