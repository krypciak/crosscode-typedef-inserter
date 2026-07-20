import { run } from './main'

const consoleEl = document.querySelector<HTMLTextAreaElement>('#console-output')!
const inputCodeEl = document.querySelector<HTMLTextAreaElement>('#input-code')!
const outputCodeEl = document.querySelector<HTMLTextAreaElement>('#output-code')!
const uploadBtn = document.querySelector<HTMLButtonElement>('#upload-btn')!
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!
const downloadBtn = document.querySelector<HTMLButtonElement>('#download-btn')!
export const runBtn = document.querySelector<HTMLButtonElement>('#run-btn')!

export function appendConsole(...args: any[]) {
    const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ') + '\n'
    consoleEl.value += line
    consoleEl.scrollTop = consoleEl.scrollHeight
}

const origLog = console.log
const origWarn = console.warn
const origError = console.error
console.log = (...args: any[]) => {
    origLog(...args)
    appendConsole('[log]', ...args)
}
console.warn = (...args: any[]) => {
    origWarn(...args)
    appendConsole('[warn]', ...args)
}
console.error = (...args: any[]) => {
    origError(...args)
    appendConsole('[error]', ...args)
}

window.addEventListener('error', e => appendConsole('[exception]', e.message))
window.addEventListener('unhandledrejection', e => appendConsole('[unhandled promise]', String(e.reason)))

uploadBtn.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    inputCodeEl.value = await file.text()
    appendConsole(`[ui] loaded ${file.name} (${file.size} bytes)`)
})
export function getCodeInputString() {
    return inputCodeEl.value.trim()
}
export function writeToOuptutTextField(text: string) {
    outputCodeEl.value = text
}

downloadBtn.addEventListener('click', () => {
    const text = outputCodeEl.value
    if (!text) {
        appendConsole('[ui] nothing to download')
        return
    }
    const blob = new Blob([text], { type: 'text/javascript' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'game.compiled.typed.js'
    a.click()
    URL.revokeObjectURL(a.href)
    appendConsole('[ui] download started')
})

runBtn.addEventListener('click', () => run())
