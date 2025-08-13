import * as fs from 'fs'
import { assert } from './misc'
import { applyLebab } from './lebab'
import { injectIntoGameCompiled } from './inject-into-game-compiled'
import { createGameCompiledProgram, getTypeInjectsAndTypedStats } from './type-injects'
import { getModulesInfo } from './modules-info'

async function run() {
    const typedefRepoPath = process.env['TYPEDEF_REPO']!
    let gameCompiledPath = process.env['GAME_COMPILED_JS']!
    const outGameCompiledPath = process.env['OUTPUT_GAME_COMPILED_JS']!
    assert(typedefRepoPath, 'TYPEDEF_REPO enviroment variable not set!')
    assert(gameCompiledPath, 'GAME_COMPILED_JS enviroment variable not set!')
    assert(outGameCompiledPath, 'OUTPUT_GAME_COMPILED_JS enviroment variable not set!')
    const outTypesPath: string = './typedefs.json'

    gameCompiledPath = await applyLebab(gameCompiledPath)

    const typedefModulesPath = `${typedefRepoPath}/modules`
    const { typedefModuleRecord, classPathToModule } = await getModulesInfo(typedefModulesPath)
    await fs.promises.writeFile(outTypesPath, JSON.stringify(typedefModuleRecord, null, 4))

    const gameCompiledInfo = await createGameCompiledProgram(gameCompiledPath)

    const { changeQueue, typedStats } = await getTypeInjectsAndTypedStats(
        classPathToModule,
        typedefModuleRecord,
        typedefModulesPath,
        gameCompiledInfo
    )

    await injectIntoGameCompiled(gameCompiledPath, outGameCompiledPath, changeQueue)

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
await run()
