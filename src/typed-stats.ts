interface Stat {
    typed: [string, string][]
    untyped: [string, string][]
}

export class TypedStats {
    fields: Stat = { typed: [], untyped: [] }
    methods: Stat = { typed: [], untyped: [] }
    functions: Stat = { typed: [], untyped: [] }
    localFunctions: Stat = { typed: [], untyped: [] }
    classes: Stat = { typed: [], untyped: [] }

    statToString(suffix: string, stat: Stat): string {
        const t = stat.typed.length
        const u = stat.untyped.length
        const avg = 100 * (t / (t + u))
        return `${suffix} total: ${(t + u).toString().padStart(5)}  typedefs: ${t.toString().padStart(5)}  ${avg.toFixed(2)}%\n`
    }

    toString(): string {
        let allTyped = 0
        let allUntyped = 0

        for (const stat of [this.fields, this.methods, this.functions, this.localFunctions, this.classes]) {
            allTyped += stat.typed.length
            allUntyped += stat.untyped.length
        }

        const text =
            '\n' +
            this.statToString('classes       ', this.classes) +
            this.statToString('methods       ', this.methods) +
            this.statToString('functions     ', this.functions) +
            this.statToString('localFunctions', this.localFunctions) +
            this.statToString('fields        ', this.fields) +
            this.statToString('total         ', { typed: new Array(allTyped), untyped: new Array(allUntyped) })

        return text
    }
}
