import ts, { type SourceFile } from 'typescript'

class CacheMap<K, T> {
    private cache = new Map<K, T>()

    constructor(private create: (key: K) => T) {}

    get(key: K): T {
        if (this.cache.has(key)) return this.cache.get(key)!
        const v = this.create(key)
        this.cache.set(key, v)
        return v
    }
}
export class TypescriptProgram {
    program: ts.Program
    outputFiles: Record<string, string> = {}

    constructor(public files: Record<string, string>) {
        const sourceFiles = new CacheMap<string, SourceFile | undefined>(filePath => {
            const contents = files[filePath]
            if (!contents) return
            return ts.createSourceFile(filePath, contents, ts.ScriptTarget.ESNext)
        })

        this.program = ts.createProgram(
            Object.keys(files),
            {
                target: ts.ScriptTarget.ES5,
                module: ts.ModuleKind.CommonJS,
                allowJs: true,
            },
            {
                fileExists: f => !!files[f],
                readFile: f => files[f],
                writeFile: (f, c) => (this.outputFiles[f] = c),
                getSourceFile: f => sourceFiles.get(f),
                getDefaultLibFileName: () => 'node_modules/typescript/lib/lib.es2015.d.ts',
                directoryExists: () => true,
                getCurrentDirectory: () => '',
                getDirectories: () => [],
                getNewLine: () => '\n',
                getCanonicalFileName: f => f.split('\\').join('/'),
                useCaseSensitiveFileNames: () => false,
                jsDocParsingMode: ts.JSDocParsingMode.ParseAll,
            }
        )

        this.program.getTypeChecker()
    }
}
