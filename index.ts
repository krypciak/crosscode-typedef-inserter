export function assert(v: any, msg?: string): asserts v {
    if (!v) throw new Error(`Assertion error${msg ? `: ${msg}` : ''}`)
}
import ts, { SyntaxKind } from 'typescript'
import * as lebab from 'lebab'
import * as fs from 'fs'
import * as path from 'path'
const fileExists = async (path: string) => !!(await fs.promises.stat(path).catch(_ => false))

const typedefRepoPath = process.env['TYPEDEF_REPO']!
let gameCompiledPath = process.env['GAME_COMPILED_JS']!
const outGameCompiledPath = process.env['OUTPUT_GAME_COMPILED_JS']!
assert(typedefRepoPath, 'TYPEDEF_REPO enviroment variable not set!')
assert(gameCompiledPath, 'GAME_COMPILED_JS enviroment variable not set!')
assert(outGameCompiledPath, 'OUTPUT_GAME_COMPILED_JS enviroment variable not set!')
const outTypesPath: string = './typedefs.json'

async function applyLebab() {
    const outPath = './game.compiled.lebab.js'
    if (!fileExists(outPath)) {
        const orig = await fs.promises.readFile(gameCompiledPath, 'utf8')
        let code = orig

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
            'default-param',
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
        await fs.promises.writeFile(outPath, code, 'utf8')
    }
    gameCompiledPath = outPath
}
await applyLebab()

type Type = string
export interface Field {
    type: Type
    isOptional?: boolean
}
export interface Function {
    returnType: string
    args: {
        name: string
        type: string
        isOptional: boolean
    }[]
}
export interface VarList {
    fields: Record<string, Field>
    functions: Record<string, Function>

    parents: string[]
}
function defVarList(): VarList {
    return {
        fields: {},
        functions: {},
        parents: [],
    }
}

type IndentStyle = 'tab' | '2space' | '4space'
function getIndentStyleOfFile(lines: string[]): IndentStyle {
    let lastIndent = 0
    for (let line of lines) {
        let spaces = 0
        while (line.startsWith(' ')) {
            spaces++
            line = line.slice(1)
        }
        let tabs = 0
        while (line.startsWith('\t')) {
            tabs++
            line = line.slice(1)
        }
        if (tabs != 0) assert(spaces == 0)
        if (spaces != 0) assert(tabs == 0)

        if (tabs != 0) return 'tab'
        if (spaces != 0) {
            if (lastIndent) {
                const diff = Math.abs(lastIndent - spaces)
                if (diff == 2) return '2space'
                else if (diff == 4) return '4space'
                else assert(false)
            }
            lastIndent = spaces
        }
    }
    return '4space'
}
function getIndentCountOfLine(style: IndentStyle, line: string) {
    if (style == 'tab') {
        for (let i = 0; i < line.length; i++) if (line[i] != '\t') return i
    } else if (style == '2space') {
        for (let i = 0; i < line.length; i++)
            if (line[i] != ' ') {
                assert((i / 2) % 1 == 0)
                return i / 2
            }
    } else if (style == '4space') {
        for (let i = 0; i < line.length; i++)
            if (line[i] != ' ') {
                // if ((i / 4) % 1 == 0) console.warn(`non divisible by four: ${line}`)
                return Math.ceil(i / 4)
            }
    }
    assert(false)
}
function getIndentX(style: IndentStyle, count: number) {
    if (style == 'tab') return '\t'.repeat(count)
    if (style == '2space') return '  '.repeat(count)
    if (style == '4space') return '    '.repeat(count)
}

const typedefModulesPath = `${typedefRepoPath}/modules`
const typedefModuleList = (await fs.promises.readdir(typedefModulesPath)).map(a => a.slice(0, -5)).filter(Boolean)
const typedefModulesIndentStyles: Map<string, IndentStyle> = new Map(
    await Promise.all(
        typedefModuleList.map(async module => {
            const str = await fs.promises.readFile(typedefModulesPath + '/' + module + '.d.ts', 'utf8')
            return [module, getIndentStyleOfFile(str.split('\n'))] as [string, IndentStyle]
        })
    )
)

let typedefModuleRecord: Record<string, Record<string, VarList>> = {}
for (const module of typedefModuleList) typedefModuleRecord[module] = {}

const classPathToModule: Record<string, string> = {}

// function print(node: ts.Node) {
//     console.log(
//         node.getChildren().map(a => {
//             return {
//                 kind: a.kind,
//                 text: a.getText().slice(0, 100),
//             }
//         })
//     )
// }
declare global {
    interface Array<T> {
        last(): T
    }
}
Array.prototype.last = function (this: []) {
    return this[this.length - 1]
}
async function getModulesInfo(force: boolean = false) {
    console.log('reading from typedefs...')
    if (!force && (await fileExists(outTypesPath))) {
        const data = JSON.parse(await fs.promises.readFile(outTypesPath, 'utf8'))
        typedefModuleRecord = data
        return
    }

    const files = typedefModuleList.map(a => `${typedefModulesPath}/${a}`)
    const program = ts.createProgram(files, {
        target: ts.ScriptTarget.ES2015,
        module: ts.ModuleKind.CommonJS,
    })

    program.getTypeChecker()

    for (const sourceFile of program.getSourceFiles()) {
        const baseName = path.basename(sourceFile.fileName)
        if (!(baseName.startsWith('game.') || baseName.startsWith('impact.'))) continue

        const module = baseName.slice(0, -5)
        ts.forEachChild(sourceFile, node => visit(module, node, []))
    }
    fs.promises.writeFile('typedefs.json', JSON.stringify(typedefModuleRecord, null, 4))
    return

    function getTypeFullName(type: string, _nsStack: string[]): string {
        if (
            type == 'number' ||
            type == 'string' ||
            type == 'unknown' ||
            type == 'boolean' ||
            type == 'object' ||
            type == 'function'
        )
            return type

        return type
        // if (type.startsWith('ig') || type.startsWith('sc')) return type
        //
        // return nsStack.join('.') + '.' + type
    }

    function visit(module: string, node: ts.Node, nsStack: string[]) {
        if (ts.isModuleDeclaration(node)) {
            const name = node.name.text
            if (name != 'global') nsStack.push(name)
        } else if (ts.isEnumDeclaration(node)) {
            // nah
        } else if (ts.isTypeAliasDeclaration(node)) {
            // nah
        } else if (ts.isVariableDeclaration(node)) {
            const name = node.name.getText()
            const type = getTypeFullName(node.type!.getText(), nsStack)
            const nsPath = nsStack.join('.')
            typedefModuleRecord[module][nsPath] ??= defVarList()
            typedefModuleRecord[module][nsPath].fields[name] = { type }
        } else if (ts.isPropertySignature(node)) {
            const name = node.name.getText()
            const type = getTypeFullName(node.type!.getText(), nsStack)
            const nsPath = nsStack.join('.')
            typedefModuleRecord[module][nsPath] ??= defVarList()
            typedefModuleRecord[module][nsPath].fields[name] = { type, isOptional: !!node.questionToken }

            const right = node.getChildren()[2]
            if (ts.isTypeLiteralNode(right)) {
                if (right.getChildren()[0].kind == 19 && right.getChildren()[2].kind == 20) {
                    nsStack.push(name)
                }
            }
        } else if (ts.isInterfaceDeclaration(node)) {
            let name = node.name.text
            if (name.endsWith('Constructor')) name = name.slice(0, -'Constructor'.length)
            if (name.endsWith('_CONSTRUCTOR')) name = name.slice(0, -'_CONSTRUCTOR'.length)

            nsStack.push(name)
            const nsPath = nsStack.join('.')
            classPathToModule[nsPath] = module
            if (node.heritageClauses && node.heritageClauses.length > 0) {
                for (const type of node.heritageClauses![0].types) {
                    const typeStr = type.getText()
                    typedefModuleRecord[module][nsPath] ??= defVarList()
                    if (!typeStr.startsWith('ImpactClass')) {
                        typedefModuleRecord[module][nsPath].parents.push(typeStr)
                    }
                }
            }
        } else if (ts.isMethodSignature(node)) {
            const name = node.name.getText()
            const returnType = getTypeFullName(node.type!.getText(), nsStack)
            const args: Function['args'] = node.parameters.map(a => {
                let name = a.name.getText()
                if (name.length == 1) name = name + '_'
                return {
                    name,
                    type: getTypeFullName(a.type?.getText() ?? 'unknown', nsStack),
                    isOptional: !!a.questionToken,
                }
            })
            if (args.length > 0 && args[0].name == 'this') args.splice(0, 1)
            const nsPath = nsStack.join('.')
            typedefModuleRecord[module][nsPath] ??= defVarList()
            typedefModuleRecord[module][nsPath].functions[name] = { returnType, args }
        } else if (ts.isConstructSignatureDeclaration(node)) {
            const args: Function['args'] = node.parameters.map(a => {
                let name = a.name.getText()
                if (name.length == 1) name = name + '_'
                return {
                    name,
                    type: getTypeFullName(a.type?.getText() ?? 'unknown', nsStack),
                    isOptional: !!a.questionToken,
                }
            })

            const returnType = getTypeFullName(node.type!.getText(), nsStack)
            let nsPath: string
            if (returnType.startsWith('ig.') || returnType.startsWith('sc.')) {
                nsPath = returnType
            } else {
                nsPath = [...nsStack.slice(0, -1), returnType].join('.')
            }
            typedefModuleRecord[module][nsPath] ??= defVarList()
            typedefModuleRecord[module][nsPath].functions['init'] = { returnType, args }
        }
        ts.forEachChild(node, node => visit(module, node, [...nsStack]))
    }
}
await getModulesInfo(true)

// prettier-ignore
const changeQueue: ({ pos: number } & (
    { operation: 'inject'; type: string, isOptional?: boolean } |
    { operation: 'rename'; from: string; to: string }
))[] = []

const typedStats = {
    fields: { typed: 0, untyped: 0 },
    functions: { typed: 0, untyped: 0 },
    classes: { typed: 0, untyped: 0 },
}

async function getTypeInjects() {
    console.log('gathering all changes...')
    const gameCompiledSplit: string[] = (await fs.promises.readFile(gameCompiledPath, 'utf8')).split('\n')
    const program = ts.createProgram([gameCompiledPath], {
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
        allowJs: true,
    })

    program.getTypeChecker()

    const gameCompiledIndentStyle: IndentStyle = getIndentStyleOfFile(gameCompiledSplit)

    const gameCompiledPathBase = path.basename(gameCompiledPath)
    for (const sourceFile of program.getSourceFiles()) {
        const baseName = path.basename(sourceFile.fileName)
        if (!baseName.startsWith(gameCompiledPathBase)) continue

        ts.forEachChild(sourceFile, node => rootVisit(node))
    }

    function rootVisit(node: ts.Node, depth: number = 0) {
        if (ts.isCallExpression(node)) {
            const expr = node.expression.getText()
            if (expr.startsWith('ig.module(') && expr.includes('defines')) {
                let baseCall: ts.Node = node.expression.getChildren()[0]
                while (true) {
                    const child = baseCall.getChildren()[0]
                    if (child.getText() != 'ig.module') {
                        baseCall = child
                    } else break
                }
                assert(ts.isCallExpression(baseCall))
                const module = baseCall.arguments.map(a => a.getText())[0].slice(1, -1)

                const syntaxList = node.getChildren().find(a => a.kind == 352)
                if (syntaxList) {
                    const func = syntaxList.getChildren()[0]
                    assert(ts.isFunctionExpression(func) || ts.isArrowFunction(func))
                    const innerSyntaxList = func.body.getChildren()[1]
                    assert(innerSyntaxList.kind == 352)
                    for (const child of innerSyntaxList.getChildren()) {
                        visit(child, module, [])
                    }
                }
            }
        }
        if (depth < 6) ts.forEachChild(node, node => rootVisit(node, depth + 1))
    }

    function checkAndReplaceWithRecord(module: string, nsPath: string, type: Field) {
        // check if is an enum
        const varList: VarList = typedefModuleRecord[module][nsPath]
        if (varList && Object.keys(varList.functions).length == 0 && Object.keys(varList.fields).length >= 2) {
            const firstType = Object.values(varList.fields)[0].type
            if (Object.values(varList.fields).every(a => a.type == firstType)) {
                // enum
                delete typedefModuleRecord[module][nsPath]
                type.type = `Record<K, ${firstType}>`
            }
        }
    }

    function getFromVarListRecursive<T extends 'functions' | 'fields'>(
        nsPath: string,
        varList: VarList,
        type: T,
        name: string,
        depth = 0
    ): VarList[T][any] | undefined {
        if (depth >= 100) throw new Error('depth limit!')
        if (varList[type][name]) return varList[type][name] as any
        for (let parentPath of varList.parents) {
            if (!parentPath || parentPath == 'ig.Class' || parentPath == 'ig.Config') continue
            if (!parentPath.startsWith('ig.') && !parentPath.startsWith('sc.')) {
                parentPath = nsPath.substring(0, nsPath.lastIndexOf('.')) + '.' + parentPath
            }
            const module = classPathToModule[parentPath]
            if (!module) continue
            const newVarList = typedefModuleRecord[module][parentPath]
            const ret = getFromVarListRecursive(parentPath, newVarList, type, name, depth + 1)
            if (ret) return ret
        }
    }
    function getFunction(nsPath: string, varList: VarList, name: string): Function | undefined {
        return getFromVarListRecursive(nsPath, varList, 'functions', name)
    }
    function getField(nsPath: string, varList: VarList, name: string): Field | undefined {
        return getFromVarListRecursive(nsPath, varList, 'fields', name)
    }

    function isUnderClass(node: ts.Node): boolean {
        const parent = node.parent.parent
        if (ts.isCallExpression(parent)) {
            if (parent.expression.getText().includes('extend')) {
                return true
            }
        }
        return false
    }

    function visit(node: ts.Node, module: string, nsStack: string[]) {
        const injectIntoFunction = (
            nsPath: string,
            name: string,
            right: ts.FunctionExpression | ts.MethodDeclaration | ts.ArrowFunction
        ) => {
            const varList: VarList = typedefModuleRecord[module][nsPath]

            if (!varList) {
                typedStats.functions.untyped++
            } else {
                const type = getFunction(nsPath, varList, name)
                typedStats.functions[type ? 'typed' : 'untyped']++
                if (type) {
                    const argNames = right.parameters.map(a => a.name.getText())
                    const len = Math.min(argNames.length, type.args.length)
                    if (len != type.args.length && name == 'init') return

                    const varTable: Map<string, string> = new Map()
                    for (let i = 0; i < len; i++) {
                        varTable.set(argNames[i], type.args[i].name)
                    }

                    for (let i = 0; i < len; i++) {
                        const to: string = varTable.get(argNames[i])!
                        changeQueue.push({
                            operation: 'rename',
                            from: argNames[i],
                            to: to,
                            pos: right.parameters[i].getStart(),
                        })
                        changeQueue.push({
                            operation: 'inject',
                            type: type.args[i].type,
                            pos: right.parameters[i].end,
                            isOptional: type.args[i].isOptional,
                        })
                    }
                    changeQueue.push({
                        operation: 'inject',
                        type: type.returnType,
                        pos: right.body!.getStart() - 1,
                    })

                    let functionNodes: Iterable<ts.Node>
                    if (ts.isArrowFunction(right)) {
                        if (!ts.isBlock(right.body)) {
                            functionNodes = [right.body]
                        } else {
                            functionNodes = right.body.statements
                        }
                    } else {
                        functionNodes = right.body!.statements
                    }
                    for (const statement of functionNodes) {
                        functionVisit(statement, module, nsPath, varTable)
                    }
                }
                nextVisit = false
            }
        }

        let nextVisit = true
        if (ts.isBinaryExpression(node) && node.operatorToken.kind == SyntaxKind.EqualsToken) {
            let name = node.left.getText()
            if (node.right.getChildCount() == 4 && node.right.getChildren()[0].getText().includes('extend')) {
                if (name == 'sc.PROXY_TYPE.BALL') name = 'sc.BallInfo'
                // class extend
                nsStack.push(name)

                const nsPath = nsStack.join('.')
                const varList: VarList = typedefModuleRecord[module][nsPath]
                typedStats.classes[varList ? 'typed' : 'untyped']++
            } else if (
                node.right.getChildCount() == 3 &&
                node.right.getChildren()[0].kind == 19 &&
                node.right.getChildren()[2].kind == 20
            ) {
                // function namespace
                nsStack.push(name)

                const type: Field = { type: 'none' }
                checkAndReplaceWithRecord(module, nsStack.join('.'), type)
                if (type.type != 'none') {
                    changeQueue.push({
                        operation: 'inject',
                        type: type.type,
                        pos: node.right.getChildren()[0].getStart() - 1,
                    })
                }
            } else if (ts.isFunctionExpression(node.right) || ts.isArrowFunction(node.right)) {
                const ns = node.left.getText()
                const sp = ns.split('.')
                const name = sp.last()
                injectIntoFunction(sp.slice(0, -1).join('.'), name, node.right)
            }
        } else if (ts.isObjectLiteralElement(node)) {
            const name = node.name!.getText()
            const nsPath = nsStack.join('.')

            let right = node.getChildren()[2]
            if (ts.isMethodDeclaration(node)) right = node

            const varList: VarList = typedefModuleRecord[module][nsPath]

            if (ts.isFunctionExpression(right) || ts.isMethodDeclaration(right)) {
                injectIntoFunction(nsPath, name, right)
            } else {
                if (!varList) {
                    if (isUnderClass(node)) typedStats.fields.untyped++
                } else {
                    if (ts.isObjectLiteralExpression(right)) {
                        nsStack.push(name)
                    }
                    const type = getField(nsPath, varList, name)
                    if (isUnderClass(node)) {
                        typedStats.fields[type ? 'typed' : 'untyped']++
                    }

                    if (type && ts.isObjectLiteralExpression(right)) {
                        checkAndReplaceWithRecord(module, `${nsPath}.${name}`, type)
                    }

                    if (type && (!ts.isObjectLiteralExpression(right) || !type.type.includes('{'))) {
                        const indentStyle: IndentStyle = typedefModulesIndentStyles.get(module)!
                        const sp = type.type.split('\n')
                        const indents: number[] = sp.map(line => getIndentCountOfLine(indentStyle, line))
                        let minIndent = 9999
                        for (let i = 1; i < indents.length; i++) minIndent = Math.min(minIndent, indents[i])
                        for (let i = 1; i < indents.length; i++) indents[i] -= minIndent

                        const { line } = ts.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart())
                        const baseIndent = getIndentCountOfLine(gameCompiledIndentStyle, gameCompiledSplit[line])
                        for (let i = 1; i < indents.length; i++) indents[i] += baseIndent
                        indents[indents.length - 1] = baseIndent

                        for (let i = 1; i < sp.length; i++) {
                            sp[i] = getIndentX(gameCompiledIndentStyle, indents[i]) + sp[i].trim()
                        }

                        const typeStr = sp.join('\n')
                        changeQueue.push({
                            operation: 'inject',
                            type: typeStr,
                            pos: node.name!.end,
                            isOptional: type.isOptional,
                        })
                    }
                }
            }
        } else if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
            nextVisit = false
        }
        if (nextVisit) ts.forEachChild(node, node => visit(node, module, [...nsStack]))
    }

    function functionVisit(node: ts.Node, module: string, nsPath: string, varTable: Map<string, string>) {
        let childOffset = 0
        if (ts.isPropertyAssignment(node)) {
            const child1 = node.getChildren()[0]
            assert(ts.isIdentifier(child1))
            const name = child1.getText()
            if (varTable.has(name)) {
                // console.log(node.kind + ' ' + node.getText().slice(0, 30))
                // print(node)
                childOffset = 1
            }
        }
        if (ts.isPropertyAccessExpression(node)) {
        } else if (ts.isIdentifier(node)) {
            const name = node.getText()
            if (varTable.has(name)) {
                let rename = true
                if (ts.isPropertyAccessExpression(node.parent)) {
                    let topParent = node.parent
                    while (true) {
                        if (ts.isPropertyAccessExpression(topParent.parent)) {
                            topParent = topParent.parent
                        } else break
                    }
                    const sp = topParent
                        .getText()
                        .split('.')
                        .map(a => a.trim())
                    if (sp[0] != node.getText()) rename = false
                }
                if (rename) {
                    changeQueue.push({
                        operation: 'rename',
                        from: name,
                        to: varTable.get(name)!,
                        pos: node.getStart(),
                    })
                }
            }
        }
        node.getChildren()
            .slice(childOffset)
            .forEach(node => functionVisit(node, module, nsPath, varTable))
    }
}
await getTypeInjects()

async function injectIntoGameCompiled() {
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
await injectIntoGameCompiled()
console.log(typedStats)
console.log('all done')
console.log('result saved into', outGameCompiledPath)
