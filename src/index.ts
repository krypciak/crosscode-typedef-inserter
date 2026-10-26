import * as fs from 'fs'

import { assert } from './assert'
import { createGameCompiledProgram, getTypeInjectsAndTypedStats } from './type-injects'
import { getModulesInfo } from './modules-info'
import { runLebabPasses, runPrettier } from './lebab'

const fileExists = async (path: string) => !!(await fs.promises.stat(path).catch(_ => false))

export async function run() {
    const typedefRepoPath = process.env['TYPEDEF_REPO']!
    let gameCompiledPath = process.env['GAME_COMPILED_JS']!
    const outGameCompiledPath = process.env['OUTPUT_GAME_COMPILED_JS']!
    assert(typedefRepoPath, 'TYPEDEF_REPO enviroment variable not set!')
    assert(gameCompiledPath, 'GAME_COMPILED_JS enviroment variable not set!')
    assert(outGameCompiledPath, 'OUTPUT_GAME_COMPILED_JS enviroment variable not set!')
    const outTypesPath: string = './typedefs.json'

    let code: string
    {
        const lebabCodePath = './game-compiled/game.compiled.lebab.js'
        if (await fileExists(lebabCodePath)) {
            code = await fs.promises.readFile(lebabCodePath, 'utf8')
        } else {
            code = await fs.promises.readFile(gameCompiledPath, 'utf8')
            code = await runPrettier(code)
            code = await runLebabPasses(code)

            await fs.promises.writeFile(lebabCodePath, code)
        }
    }

    const typedefsFiles = Object.fromEntries(
        await Promise.all(
            (await fs.promises.readdir(typedefRepoPath, { recursive: true }))
                .filter(f => !f.startsWith('node_modules') && (f.endsWith('.ts') || f.endsWith('.js')))
                .map(async f => [f, await fs.promises.readFile(typedefRepoPath + '/' + f, 'utf8')] as const)
        )
    )

    const { typedefModuleRecord, classPathToModule } = await getModulesInfo(typedefsFiles)
    try {
        await fs.promises.writeFile(outTypesPath, JSON.stringify(typedefModuleRecord, null, 4))
    } catch (e) {
        console.error('error while writing types:', e)
    }

    const gameCompiledInfo = await createGameCompiledProgram(code)

    const { changeQueue, typedStats } = await getTypeInjectsAndTypedStats(
        classPathToModule,
        typedefModuleRecord,
        typedefsFiles,
        gameCompiledInfo
    )

    const outputCode = changeQueue.combine(code)
    await fs.promises.writeFile(outGameCompiledPath, outputCode, 'utf8')

    console.log('all done')
    console.log('result saved into', outGameCompiledPath)

    let allTyped = 0
    let allUntyped = 0

    const statToStr = (name: string, { typed, untyped }: { typed: unknown[]; untyped: unknown[] }): string => {
        const t = typed.length
        const u = untyped.length
        const avg = 100 * (t / (t + u))
        allTyped += t
        allUntyped += u
        return `${name} total: ${(t + u).toString().padStart(5)}  typedefs: ${t.toString().padStart(5)}  ${avg.toFixed(2)}%\n`
    }

    const text =
        '\n' +
        statToStr('classes       ', typedStats.classes) +
        statToStr('methods       ', typedStats.methods) +
        statToStr('functions     ', typedStats.functions) +
        statToStr('localFunctions', typedStats.localFunctions) +
        statToStr('fields        ', typedStats.fields) +
        statToStr('total         ', { typed: new Array(allTyped), untyped: new Array(allUntyped) })
    console.log(text)

    // console.log(typedStats.localFunctions.untyped.map(([module, path]) => `${path.padEnd(80)} ${module}`).join('\n'))
}
