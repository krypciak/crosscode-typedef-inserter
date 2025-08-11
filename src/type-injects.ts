import ts, { SyntaxKind } from 'typescript'
import * as fs from 'fs'
import * as path from 'path'
import { type ChangeQueue } from './inject-into-game-compiled'
import { assert } from './misc'
import type { Field, VarList, Function } from './modules-info'

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

async function readModuleIndentStyles(typedefModuleList: string[], typedefModulesPath: string) {
    const typedefModulesIndentStyles: Map<string, IndentStyle> = new Map(
        await Promise.all(
            typedefModuleList.map(async module => {
                const str = await fs.promises.readFile(typedefModulesPath + '/' + module + '.d.ts', 'utf8')
                return [module, getIndentStyleOfFile(str.split('\n'))] as [string, IndentStyle]
            })
        )
    )
    return { typedefModulesIndentStyles }
}

export async function createGameCompiledProgram(gameCompiledPath: string) {
    const gameCompiledSplit: string[] = (await fs.promises.readFile(gameCompiledPath, 'utf8')).split('\n')
    const program = ts.createProgram([gameCompiledPath], {
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
        allowJs: true,
    })

    program.getTypeChecker()

    const gameCompiledIndentStyle: IndentStyle = getIndentStyleOfFile(gameCompiledSplit)

    return { program, gameCompiledIndentStyle, gameCompiledSplit, pathBase: path.basename(gameCompiledPath) }
}

function getClassAliases(
    classPathToModule: Record<string, string>,
    typedefModuleRecord: Record<string, Record<string, VarList>>
) {
    function alias(module: string, aliases: Record<string, string>, noSetModule?: boolean) {
        const obj = typedefModuleRecord[module]
        assert(obj)
        for (const [gameCompiledName, typedefName] of Object.entries(aliases)) {
            obj[gameCompiledName] = obj[typedefName]
            if (!noSetModule) {
                assert(!classPathToModule[gameCompiledName])
                classPathToModule[gameCompiledName] = module
            }
        }
    }

    alias('game.feature.gui.hud.combat-hud', {
        'b.ContentGui': 'sc.CombatUpperHud.ContentGui',
        'b.EMPTY': 'sc.CombatUpperHud.CONTENT_GUI.EMPTY',
        'b.RANKED': 'sc.CombatUpperHud.CONTENT_GUI.RANKED',
        'b.PVP': 'sc.CombatUpperHud.CONTENT_GUI.PVP',
    })
    alias('impact.feature.gui.gui', { i: 'ig.GuiRenderer' })
    alias('game.feature.combat.model.enemy-reaction', { a: 'sc.EnemyReactionBase' })
    alias('game.feature.combat.entities.ball', { 'sc.PROXY_TYPE.BALL': 'sc.BallInfo' }, true)
    alias('game.feature.combat.model.combat-status', { 'sc.COMBAT_STATUS[0]': 'sc.BurnStatus' })
    alias('game.feature.combat.model.combat-status', { 'sc.COMBAT_STATUS[1]': 'sc.ChillStatus' })
    alias('game.feature.combat.model.combat-status', { 'sc.COMBAT_STATUS[2]': 'sc.JoltStatus' })
    alias('game.feature.combat.model.combat-status', { 'sc.COMBAT_STATUS[3]': 'sc.MarkStatus' })
    alias('game.feature.menu.gui.options.options-types', {
        'sc.OPTION_GUIS[sc.OPTION_TYPES.BUTTON_GROUP]': 'sc.OPTION_GUIS_DEFS.BUTTON_GROUP',
        'sc.OPTION_GUIS[sc.OPTION_TYPES.OBJECT_SLIDER]': 'sc.OPTION_GUIS_DEFS.OBJECT_SLIDER',
        'sc.OPTION_GUIS[sc.OPTION_TYPES.ARRAY_SLIDER]': 'sc.OPTION_GUIS_DEFS.ARRAY_SLIDER',
        'sc.OPTION_GUIS[sc.OPTION_TYPES.CONTROLS]': 'sc.OPTION_GUIS_DEFS.CONTROLS',
        'sc.OPTION_GUIS[sc.OPTION_TYPES.LANGUAGE]': 'sc.OPTION_GUIS_DEFS.LANGUAGE',
    })
    alias('impact.feature.effect.fx.fx-circle', { e: 'ig.EFFECT_ENTRY.EffectStepCircleBase' })
}

export async function getTypeInjectsAndTypedStats(
    classPathToModule: Record<string, string>,
    typedefModuleRecord: Record<string, Record<string, VarList>>,
    typedefModulesPath: string,
    gameCompiledInfo: Awaited<ReturnType<typeof createGameCompiledProgram>>,
    generateInjects: boolean = true
) {
    const changeQueue: ChangeQueue = []

    const typedStats = {
        fields: { typed: 0, untyped: 0 },
        functions: { typed: 0, untyped: 0 },
        classes: { typed: 0, untyped: 0 },
    }

    console.log('gathering all changes...')

    getClassAliases(classPathToModule, typedefModuleRecord)

    const { typedefModulesIndentStyles } = generateInjects
        ? await readModuleIndentStyles(Object.keys(typedefModuleRecord), typedefModulesPath)
        : { typedefModulesIndentStyles: new Map<string, IndentStyle>() }

    for (const sourceFile of gameCompiledInfo.program.getSourceFiles()) {
        const baseName = path.basename(sourceFile.fileName)
        if (!baseName.startsWith(gameCompiledInfo.pathBase)) continue

        ts.forEachChild(sourceFile, node => rootVisit(node))
    }

    return { changeQueue, typedStats }

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

            let module = classPathToModule[parentPath]
            if (!module && !parentPath.startsWith('ig.') && !parentPath.startsWith('sc.')) {
                parentPath = nsPath.substring(0, nsPath.lastIndexOf('.')) + '.' + parentPath
                module = classPathToModule[parentPath]
            }

            if (!module) continue
            const newVarList = typedefModuleRecord[module][parentPath]
            if (!newVarList) continue
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

                if (generateInjects && type) {
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

        if (
            (ts.isBinaryExpression(node) && node.operatorToken.kind == SyntaxKind.EqualsToken) ||
            (ts.isVariableDeclaration(node) && node.initializer)
        ) {
            let name = ts.isBinaryExpression(node) ? node.left.getText() : node.name.getText()
            const right = ts.isBinaryExpression(node) ? node.right : node.initializer!

            if (right.getChildCount() == 4 && right.getChildren()[0].getText().includes('extend')) {
                // class extend
                nsStack.push(name)

                const nsPath = nsStack.join('.')
                const varList: VarList = typedefModuleRecord[module][nsPath]
                typedStats.classes[varList ? 'typed' : 'untyped']++
                // if (!varList) console.log(nsPath, '\t\t\t\t', module)
            } else if (
                right.getChildCount() == 3 &&
                right.getChildren()[0].kind == 19 &&
                right.getChildren()[2].kind == 20
            ) {
                // function namespace
                nsStack.push(name)

                const type: Field = { type: 'none' }
                checkAndReplaceWithRecord(module, nsStack.join('.'), type)
                if (type.type != 'none') {
                    changeQueue.push({
                        operation: 'inject',
                        type: type.type,
                        pos: right.getChildren()[0].getStart() - 1,
                    })
                }
            } else if (ts.isFunctionExpression(right) || ts.isArrowFunction(right)) {
                const sp = name.split('.')
                const funcName = sp.last()

                injectIntoFunction(sp.slice(0, -1).join('.'), funcName, right)
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
                        typedStats.fields[type && type.type != 'unknown' ? 'typed' : 'untyped']++
                    }

                    if (type && ts.isObjectLiteralExpression(right)) {
                        checkAndReplaceWithRecord(module, `${nsPath}.${name}`, type)
                    }

                    if (generateInjects && type && (!ts.isObjectLiteralExpression(right) || !type.type.includes('{'))) {
                        const indentStyle: IndentStyle = typedefModulesIndentStyles.get(module)!
                        const sp = type.type.split('\n')
                        const indents: number[] = sp.map(line => getIndentCountOfLine(indentStyle, line))
                        let minIndent = 9999
                        for (let i = 1; i < indents.length; i++) minIndent = Math.min(minIndent, indents[i])
                        for (let i = 1; i < indents.length; i++) indents[i] -= minIndent

                        const { line } = ts.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart())
                        const baseIndent = getIndentCountOfLine(
                            gameCompiledInfo.gameCompiledIndentStyle,
                            gameCompiledInfo.gameCompiledSplit[line]
                        )
                        for (let i = 1; i < indents.length; i++) indents[i] += baseIndent
                        indents[indents.length - 1] = baseIndent

                        for (let i = 1; i < sp.length; i++) {
                            sp[i] = getIndentX(gameCompiledInfo.gameCompiledIndentStyle, indents[i]) + sp[i].trim()
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
