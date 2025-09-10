// @ts-expect-error
import * as lebab from 'lebab'
import * as fs from 'fs'
import { fileExists } from './misc'

function applyLebabToCode(origCode: string) {
    let code = origCode

    /* this has to split into multiple passes because of https://github.com/lebab/lebab/issues/205 */
    console.log('running lebab pass 1...')
    code = lebab.transform(code, ['multi-var']).code
    console.log('running lebab pass 2...')
    code = lebab.transform(code, ['multi-var']).code
    // type res = { code: string; warnings: { type: string; line: number; msg: string }[] }
    console.log('running lebab pass 3...')
    code = lebab.transform(code, [
        // 'class',
        'template',
        'arrow',
        'arrow-return',
        'let',
        // 'default-param',
        // 'destruct-param',
        'arg-spread',
        'arg-rest',
        'obj-method',
        'obj-shorthand',
        // 'no-strict',
        // 'commonjs',
        'exponent',
        'for-of',
        // 'for-each',
        'includes',
    ]).code
    code = code.replace(/window\.ig\.Class = \(\) =\> \{\}/, 'window.ig.Class = function() {}')
    code = code.replace(/let g;(\s+if \(this.attackCounter \<= 3)/, 'var g;$1')
    code = code.replace(/new ig\.TileSheet\.createFromJson/g, 'ig.TileSheet.createFromJson')

    return code
}

export async function applyLebab(gameCompiledPath: string): Promise<string> {
    const outPath = './game-compiled/game.compiled.lebab.js'
    if (!(await fileExists(outPath))) {
        const origCode = await fs.promises.readFile(gameCompiledPath, 'utf8')
        const newCode = applyLebabToCode(origCode)
        await fs.promises.writeFile(outPath, newCode)
    }
    return outPath
}
