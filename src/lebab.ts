const yieldToMain = () => new Promise<void>(r => setTimeout(r, 0))

function lebabPass1(code: string, lebab: typeof import('lebab')): string {
    return lebab.transform(code, ['multi-var']).code
}
function lebabPass2(code: string, lebab: typeof import('lebab')): string {
    return lebabPass1(code, lebab)
}
function lebabPass3(code: string, lebab: typeof import('lebab')): string {
    return lebab.transform(code, [
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
}

export async function runLebabPasses(origCode: string) {
    let code = origCode

    const lebab = await import('lebab')

    /* this has to split into multiple passes because of https://github.com/lebab/lebab/issues/205 */
    console.log('running lebab pass 1...')
    code = lebabPass1(code, lebab)
    await yieldToMain()

    console.log('running lebab pass 2...')
    code = lebabPass2(code, lebab)
    await yieldToMain()

    console.log('running lebab pass 3...')
    code = lebabPass3(code, lebab)
    await yieldToMain()

    /* revert some code breaking code transforms */
    code = code.replace(/window\.ig\.Class = \(\) =\> \{\}/, 'window.ig.Class = function() {}')
    code = code.replace(/let g;(\s+if \(this.attackCounter \<= 3)/, 'var g;$1')
    code = code.replace(/new ig\.TileSheet\.createFromJson/g, 'ig.TileSheet.createFromJson')

    return code
}

export async function runPrettier(code: string) {
    const prettier = await import('prettier')
    const babelParser = await import('prettier/plugins/babel')
    const estreeParser = await import('prettier/plugins/estree')

    console.log('running prettier')
    await yieldToMain()

    const formattedCode = await prettier.format(code, {
        parser: 'babel',
        plugins: [babelParser, estreeParser],

        semi: false,
        useTabs: false,
        tabWidth: 4,
        singleQuote: true,
        trailingComma: 'es5',
        printWidth: 120,
        quoteProps: 'as-needed',
        bracketSpacing: true,
        arrowParens: 'avoid',
    })
    return formattedCode
}
