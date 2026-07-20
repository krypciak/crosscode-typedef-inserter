import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { root, run } from './main'

const consoleMount = document.querySelector<HTMLDivElement>('#console-output')!
const inputMount = document.querySelector<HTMLDivElement>('#input-code')!
const outputMount = document.querySelector<HTMLDivElement>('#output-code')!
const uploadBtn = document.querySelector<HTMLButtonElement>('#upload-btn')!
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!
const downloadBtn = document.querySelector<HTMLButtonElement>('#download-btn')!
export const runBtn = document.querySelector<HTMLButtonElement>('#run-btn')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!

function createEditor(parent: HTMLElement, editable: boolean, doc: string = ''): EditorView {
    return new EditorView({
        state: EditorState.create({
            doc,
            extensions: [
                basicSetup,
                javascript(),
                oneDark,
                EditorView.editable.of(editable),
                EditorState.readOnly.of(!editable),
                EditorView.theme({
                    '&': { height: '100%' },
                    '.cm-scroller': { overflow: 'auto' },
                }),
            ],
        }),
        parent,
    })
}

const consoleEditor = createEditor(consoleMount, false)
const inputEditor = createEditor(inputMount, true)
const outputEditor = createEditor(outputMount, false)

export function appendConsole(...args: any[]) {
    const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ') + '\n'
    consoleEditor.dispatch({
        changes: { from: consoleEditor.state.doc.length, insert: line },
    })
    consoleEditor.dispatch({ effects: EditorView.scrollIntoView(consoleEditor.state.doc.length) })
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
    inputEditor.dispatch({
        changes: { from: 0, to: inputEditor.state.doc.length, insert: await file.text() },
    })
    appendConsole(`[ui] loaded ${file.name} (${file.size} bytes)`)
})

export function getCodeInputString() {
    return inputEditor.state.doc.toString().trim()
}
export function writeToOuptutTextField(text: string) {
    outputEditor.dispatch({
        changes: { from: 0, to: outputEditor.state.doc.length, insert: text },
    })
}

downloadBtn.addEventListener('click', () => {
    const text = outputEditor.state.doc.toString()
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

clearBtn.addEventListener('click', async () => {
    appendConsole('[ui] clearing cache...')
    for await (const file of (root as any).values()) {
        await root.removeEntry(file.name, { recursive: true })
    }
    appendConsole('[ui] cache cleared, reloading...')
    location.reload()
})
