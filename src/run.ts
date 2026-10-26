import { runTypedefsInserter } from './index'
import { assert } from './assert'

import * as fs from 'fs'

const fileExists = async (path: string) => !!(await fs.promises.stat(path).catch(_ => false))

const typedefRepoPath = process.env['TYPEDEF_REPO']!
const gameCompiledPath = process.env['GAME_COMPILED_JS']!
const outGameCompiledPath = process.env['OUTPUT_GAME_COMPILED_JS']!

assert(typedefRepoPath, 'TYPEDEF_REPO enviroment variable not set!')
assert(gameCompiledPath, 'GAME_COMPILED_JS enviroment variable not set!')
assert(outGameCompiledPath, 'OUTPUT_GAME_COMPILED_JS enviroment variable not set!')

async function getInputCode() {
    const lebabCodePath = './game-compiled/game.compiled.lebab.js'
    const hasLebabCache = await fileExists(lebabCodePath)
    const runPrettierAndLebab = !hasLebabCache
    const inputCode = await fs.promises.readFile(hasLebabCache ? lebabCodePath : gameCompiledPath, 'utf8')
    return { inputCode, runPrettierAndLebab }
}

async function getTypedefsFiles() {
    return Object.fromEntries(
        await Promise.all(
            (await fs.promises.readdir(typedefRepoPath, { recursive: true }))
                .filter(
                    f =>
                        !f.startsWith('node_modules') && (f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.json'))
                )
                .map(async f => [f, await fs.promises.readFile(typedefRepoPath + '/' + f, 'utf8')] as const)
        )
    )
}

const [{ inputCode, runPrettierAndLebab }, typedefsFiles] = await Promise.all([getInputCode(), getTypedefsFiles()])

const { typedStats, outputCode } = await runTypedefsInserter({
    code: inputCode,
    runPrettierAndLebab,
    typedefsFiles,
})
console.log('all done')

await fs.promises.writeFile(outGameCompiledPath, outputCode, 'utf8')

console.log('result saved into', outGameCompiledPath)

console.log(typedStats.toString())
