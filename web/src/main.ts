import './style.css'
import './ui.ts'
import { nodeNwjsShims } from 'web-nwjs-spoofer/src/node-nwjs-shims'
import { getUint8Array } from 'web-nwjs-spoofer/src/utils.ts'
import { copyFiles, zipToFileEntryList } from './file-copy.ts'

import { fs, configure } from '@zenfs/core'
import { WebAccess } from '@zenfs/dom'
import { appendConsole, getCodeInputString, runBtn, writeToOuptutTextField } from './ui.ts'

if (navigator.userAgent.includes('Firefox')) {
    appendConsole('[ui] WARNING: Firefox may have poor performance. Consider using Chromium-based browser.')
}

export const root = await navigator.storage.getDirectory()
await configure({
    mounts: {
        '/': { backend: WebAccess, handle: root },
    },
})

nodeNwjsShims({ fs: fs as any })

await fs.promises.mkdir('game-compiled', { recursive: true })

const typedefsRepoPath = 'ultimate-crosscode-typedefs'
const jsInputPath = 'game-compiled/game.compiled.js'
const jsLebabPath = 'game-compiled/game.compiled.lebab.js'
const jsOutputPath = 'game-compiled/game.compiled.typed.js'

process.env['TYPEDEF_REPO'] = typedefsRepoPath
process.env['GAME_COMPILED_JS'] = jsInputPath
process.env['OUTPUT_GAME_COMPILED_JS'] = jsOutputPath

async function setupTypedefsRepo() {
    if (!(await fs.promises.exists(typedefsRepoPath))) {
        const zipData = await getUint8Array(await fetch('/ultimate-crosscode-typedefs.zip'))
        const fileList = await zipToFileEntryList(zipData)
        for (const file of fileList) {
            file.path = typedefsRepoPath + '/' + file.path.substring(file.path.indexOf('/'))
        }
        await copyFiles(fileList, true)
    }
}

async function deleteLebabCacheIfCorrupted() {
    try {
        const stat = await fs.promises.stat(jsLebabPath)
        if (stat.size < 10_000) {
            await fs.promises.unlink(jsLebabPath)
            appendConsole('[ui] removed corrupted lebab output (<10KB)')
        }
    } catch {}
}

export async function run() {
    runBtn.disabled = true
    try {
        const inputCode = getCodeInputString()
        if (!inputCode) {
            appendConsole('[ui] no input provided')
            return
        }
        await fs.promises.writeFile(jsInputPath, inputCode)

        await deleteLebabCacheIfCorrupted()

        await setupTypedefsRepo()
        appendConsole('running crosscode-typedef-inserter')

        const { run: runIndex } = await import('../../src/index.ts')
        await runIndex()

        const outputCode = await fs.promises.readFile(jsOutputPath, 'utf8')
        writeToOuptutTextField(outputCode)
        appendConsole('[ui] done')
    } finally {
        runBtn.disabled = false
    }
}
