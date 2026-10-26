import { assert } from './assert'

type Change = { pos: number } & (
    | { operation: 'inject'; type: string; isOptional?: boolean }
    | { operation: 'rename'; from: string; to: string }
)
export class ChangeQueue {
    private changeQueue: Change[] = []

    inject(obj: Omit<Change & { operation: 'inject' }, 'operation'>) {
        const change = obj as Change
        change.operation = 'inject'
        this.changeQueue.push(change)
    }
    rename(obj: Omit<Change & { operation: 'rename' }, 'operation'>) {
        const change = obj as Change
        change.operation = 'rename'
        this.changeQueue.push(change)
    }

    combine(code: string): string {
        const res: string[] = []
        let i = 0
        for (let obj of this.changeQueue) {
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

        return res.join('')
    }
}
