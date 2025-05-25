import * as fs from 'fs'
import { assert } from './misc'

export type ChangeQueue = ({ pos: number } & (
    | { operation: 'inject'; type: string; isOptional?: boolean }
    | { operation: 'rename'; from: string; to: string }
))[]

export async function injectIntoGameCompiled(
    gameCompiledPath: string,
    outGameCompiledPath: string,
    changeQueue: ChangeQueue
) {
    console.log('modifing code...')
    const code = await fs.promises.readFile(gameCompiledPath, 'utf8')

    const res: string[] = []
    let i = 0
    for (let obj of changeQueue) {
        res.push(code.slice(i, obj.pos))
        i = obj.pos

        if (obj.operation == 'inject') {
            const str = `/*${obj.isOptional ? '?' : ''}: ${obj.type}*/`
            res.push(str)
        } else if (obj.operation == 'rename') {
            res.push(obj.to)
            i += obj.from.length
        } else assert(false)
    }
    res.push(code.slice(i, code.length))

    await fs.promises.writeFile(outGameCompiledPath, res.join(''), 'utf8')
}
