import { defineConfig } from 'vite'
import * as path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    resolve: {
        alias: {
            fs: require.resolve('@zenfs/core'),
            'node:fs': require.resolve('@zenfs/core'),
            assert: path.resolve(dirname, './src/assert-shim.ts'),
            path: require.resolve('path-browserify'),
            os: require.resolve('web-nwjs-spoofer/src/os-shim.ts'),
        },
    },
    build: {
        minify: false,
        commonjsOptions: {
            transformMixedEsModules: true,
        },
        terserOptions: {
            compress: false,
            mangle: false,
            sourceMap: true,
            keep_classnames: true,
            keep_fnames: true,
        } as any,
    },
    server: {
        proxy: {
            '/ultimate-crosscode-typedefs.zip': {
                target: 'https://codeload.github.com/krypciak/ultimate-crosscode-typedefs/legacy.zip/refs/heads/master',
                changeOrigin: true,
                rewrite: () => '',
            },
        },
    },
})
