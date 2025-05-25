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

    const { typed: ct, untyped: cu } = typedStats.classes
    const { typed: ft, untyped: fu } = typedStats.functions
    const { typed: et, untyped: eu } = typedStats.fields
    const cavg = 100 * (ct / (ct + cu))
    const favg = 100 * (ft / (ft + fu))
    const eavg = 100 * (et / (et + eu))
    const text =
        '\n' +
        `classes: total: ${ct + cu}, typedefs: ${ct}, ${cavg.toFixed(2)}%\n` +
        `functions: total: ${ft + fu}, typedefs: ${ft}, ${favg.toFixed(2)}%\n` +
        `fields: total: ${et + eu}, typedefs: ${et}, ${eavg.toFixed(2)}%\n` +
        `total (avg % of classes + fields + functions): ${((cavg + favg + eavg) / 3).toFixed(2)}%\n`
    console.log(text)
}
await run()
