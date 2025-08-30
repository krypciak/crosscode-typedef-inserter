import * as fs from 'fs'
import ts from 'typescript'
import * as path from 'path'

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
    renameTo?: string
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

export async function getModulesInfo(typedefModulesPath: string) {
    const typedefModuleList = (await fs.promises.readdir(typedefModulesPath)).map(a => a.slice(0, -5)).filter(Boolean)

    let typedefModuleRecord: Record<string, Record<string, VarList>> = {}
    for (const module of typedefModuleList) typedefModuleRecord[module] = {}
    typedefModuleRecord['impact-core'] = {}

    const classPathToModule: Record<string, string> = {}

    console.log('reading from typedefs...')

    const files = typedefModuleList.map(a => `${typedefModulesPath}/${a}`)
    files.push(`${typedefModulesPath}/../impact-core.d.ts`)
    const program = ts.createProgram(files, {
        target: ts.ScriptTarget.ES2015,
        module: ts.ModuleKind.CommonJS,
    })

    program.getTypeChecker()

    for (const sourceFile of program.getSourceFiles()) {
        const baseName = path.basename(sourceFile.fileName)
        if (!(baseName.startsWith('game') || baseName.startsWith('impact'))) continue

        const module = baseName.slice(0, -5)
        ts.forEachChild(sourceFile, node => visit(module, node, []))
    }
    fs.promises.writeFile('typedefs.json', JSON.stringify(typedefModuleRecord, null, 4))

    return { typedefModuleRecord, classPathToModule }

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
            if (!node.type) return
            const type = getTypeFullName(node.type.getText(), nsStack)
            const nsPath = nsStack.join('.')
            typedefModuleRecord[module][nsPath] ??= defVarList()
            typedefModuleRecord[module][nsPath].fields[name] = { type, isOptional: !!node.questionToken }

            const potentialInterfacePath = nsStack.slice(0, -1).join('.') + '.' + type
            const potentialInterface = typedefModuleRecord[module][potentialInterfacePath]
            if (potentialInterface) {
                const newNsPath = nsPath + '.' + name
                typedefModuleRecord[module][newNsPath] ??= defVarList()
                typedefModuleRecord[module][newNsPath] = potentialInterface
            }

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
        } else if (ts.isMethodSignature(node) || ts.isFunctionDeclaration(node)) {
            const name = node.name!.getText()
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
            const comments = ts.getJSDocCommentsAndTags(node).map(a => a.getText())
            let renameTo = comments.find(text => text.startsWith('/** RENAME: '))
            if (renameTo) renameTo = renameTo.substring('/** RENAME: '.length, renameTo.length - '*/'.length).trim()

            if (args.length > 0 && args[0].name == 'this') args.splice(0, 1)
            const nsPath = nsStack.join('.')
            typedefModuleRecord[module][nsPath] ??= defVarList()
            typedefModuleRecord[module][nsPath].functions[name] = { returnType, args, renameTo }
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
