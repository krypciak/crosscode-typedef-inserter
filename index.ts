const typedefRepoPath: string = './ultimate-crosscode-typedefs'
const gameCompiledPath: string = './game.compiled.js'
// const outGameCompiledPath: string = './game.compiled.typed.js'
const outTypesPath: string = './typedefs.json'

export function assert(v: any, msg?: string): asserts v {
    if (!v) throw new Error(`Assertion error${msg ? `: ${msg}` : ''}`)
}
import ts, { SyntaxKind } from 'typescript'
import * as fs from 'fs'
import * as path from 'path'

const fileExists = async (path: string) => !!(await fs.promises.stat(path).catch(_ => false))

type Type = string
interface Field {
    type: Type
}
interface Function {
    returnType: string
    args: {
        name: string
        type: string
    }[]
}
interface VarList {
    fields: Record<string, Field>
    functions: Record<string, Function>
}
function defVarList(): VarList {
    return {
        fields: {},
        functions: {},
    }
}

const typedefModulesPath = `${typedefRepoPath}/modules`
const typedefModuleList = (await fs.promises.readdir(typedefModulesPath)).map(a => a.slice(0, -5))

let typedefModuleRecord: Record<string, Record<string, VarList>> = {}
for (const module of typedefModuleList) typedefModuleRecord[module] = {}

Array.prototype.last = function (this: []) {
    return this[this.length - 1]
}
async function getModulesInfo(force: boolean = false) {
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
            typedefModuleRecord[module][nsPath].fields[name] = { type }
        } else if (ts.isInterfaceDeclaration(node)) {
            const name = node.name.text
            nsStack.push(name)
        } else if (ts.isMethodSignature(node)) {
            const name = node.name.getText()
            const returnType = getTypeFullName(node.type!.getText(), nsStack)
            const args = node.parameters.slice(1).map(a => ({
                name: a.name.getText(),
                type: getTypeFullName(a.type?.getText() ?? 'unknown', nsStack),
            }))
            const nsPath = nsStack.join('.')
            typedefModuleRecord[module][nsPath] ??= defVarList()
            typedefModuleRecord[module][nsPath].functions[name] = { returnType, args }
        } else if (ts.isConstructSignatureDeclaration(node)) {
            const args = node.parameters.map(a => ({
                name: a.name.getText(),
                type: getTypeFullName(a.type?.getText() ?? 'unknown', nsStack),
            }))

            const returnType = getTypeFullName(node.type!.getText(), nsStack)
            const nsPath = [...nsStack.slice(0, -1), returnType].join('.')
            typedefModuleRecord[module][nsPath] ??= defVarList()
            typedefModuleRecord[module][nsPath].functions['init'] = { returnType, args }
        }
        ts.forEachChild(node, node => visit(module, node, [...nsStack]))
    }
}
await getModulesInfo(false)

async function injectIntoGame() {
    const program = ts.createProgram([gameCompiledPath], {
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
        allowJs: true,
    })

    program.getTypeChecker()

    const gameCompiledPathBase = path.basename(gameCompiledPath)
    for (const sourceFile of program.getSourceFiles()) {
        const baseName = path.basename(sourceFile.fileName)
        if (!baseName.startsWith(gameCompiledPathBase)) continue

        ts.forEachChild(sourceFile, node => rootVisit(node))
    }
    return

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
                    assert(ts.isFunctionExpression(func))
                    const innerSyntaxList = func.body.getChildren()[1]
                    assert(innerSyntaxList.kind == 352)
                    if (module == 'impact.base.image') {
                        console.log(module)
                        for (const child of innerSyntaxList.getChildren()) {
                            visit(child, module, [])
                        }
                        process.exit(0)
                    }
                }
            }
        }
        if (depth < 6) ts.forEachChild(node, node => rootVisit(node, depth + 1))
    }

    function print(node: ts.Node) {
        console.log(
            node.getChildren().map(a => {
                return {
                    kind: a.kind,
                    text: a.getText().slice(0, 100),
                }
            })
        )
    }
    function visit(node: ts.Node, module: string, nsStack: string[]) {
        if (ts.isBinaryExpression(node) && node.operatorToken.kind == SyntaxKind.EqualsToken) {
            // print(node)
            const name = node.left.getText()
            if (node.right.getChildCount() == 4 && node.right.getChildren()[0].getText().includes('extend')) {
                nsStack.push(name)
            }
        } else if (ts.isObjectLiteralElement(node)) {
            const name = node.name!.getText()
            const nsPath = nsStack.join('.')
            const varList: VarList = typedefModuleRecord[module][nsPath]
            if (varList) {
                const right = node.getChildren()[2]

                if (ts.isFunctionExpression(right)) {
                    const type: Function = varList.functions[name]
                    if (type) {
                    }
                } else {
                    const type: Field = varList.fields[name]
                    if (type) {
                        // console.log(nsPath, right.kind)
                        // print(right)

                        console.log(name, "has the type", type.type)
                    }
                }
            }
        }
        ts.forEachChild(node, node => visit(node, module, [...nsStack]))
    }
}
await injectIntoGame()
