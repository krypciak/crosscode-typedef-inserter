const typedefRepoPath: string = './ultimate-crosscode-typedefs'
const gameCompiledPath: string = './game.compiled.js'
const outGameCompiledPath: string = './game.compiled.typed.js'
const outTypesPath: string = './typedefs.json'

export function assert(v: any, msg?: string): asserts v {
    if (!v) throw new Error(`Assertion error${msg ? `: ${msg}` : ''}`)
}
import ts from 'typescript'
import * as fs from 'fs'
import * as path from 'path'

const fileExists = async (path: string) => !!(await fs.promises.stat(path).catch(_ => false))

type Type = string
interface Field {
    name: string
    type: Type
}
interface Function {
    name: string
    returnType: string
    args: {
        name: string
        type: string
    }[]
}
interface VarList {
    fields: Field[]
    functions: Function[]
}
function defVarList(): VarList {
    return {
        fields: [],
        functions: [],
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
    console.log("hello")

    const files = typedefModuleList.map(a => `${typedefModulesPath}/${a}`)
    const program = ts.createProgram(files, {
        target: ts.ScriptTarget.ES5,
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
            typedefModuleRecord[module][nsPath].fields.push({ name, type })
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
            typedefModuleRecord[module][nsPath].functions.push({ name, returnType, args })
        } else if (ts.isConstructSignatureDeclaration(node)) {
            const args = node.parameters.slice(1).map(a => ({
                name: a.name.getText(),
                type: getTypeFullName(a.type?.getText() ?? 'unknown', nsStack),
            }))

            const returnType = getTypeFullName(node.type!.getText(), nsStack)
            const nsPath = [...nsStack.slice(0, -1), returnType].join('.')
            typedefModuleRecord[module][nsPath] ??= defVarList()
            typedefModuleRecord[module][nsPath].functions.push({
                name: 'init',
                returnType,
                args,
            })
        }
        ts.forEachChild(node, node => visit(module, node, [...nsStack]))
    }
}
getModulesInfo()

