import { createGameCompiledProgram, getTypeInjectsAndTypedStats } from './type-injects'
import { getModulesInfo } from './modules-info'
import { runLebabPasses, runPrettier } from './lebab'

export async function runTypedefsInserter({
    code,
    runPrettierAndLebab = false,
    typedefsFiles,
    onPartialCodeTransform = () => {},
}: {
    code: string
    runPrettierAndLebab?: boolean
    typedefsFiles: Record<string, string>
    onPartialCodeTransform?: (code: string) => void
}) {
    if (runPrettierAndLebab) {
        code = await runPrettier(code)
        onPartialCodeTransform(code)
        code = await runLebabPasses(code)
        onPartialCodeTransform(code)
    }

    const { typedefModuleRecord, classPathToModule } = await getModulesInfo(typedefsFiles)

    const gameCompiledInfo = await createGameCompiledProgram(code)

    const { changeQueue, typedStats } = await getTypeInjectsAndTypedStats(
        classPathToModule,
        typedefModuleRecord,
        typedefsFiles,
        gameCompiledInfo
    )

    const outputCode = changeQueue.combine(code)

    return { typedStats, outputCode }
}
