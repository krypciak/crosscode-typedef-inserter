import { unzipSync, type Unzipped } from 'fflate'
import { throttleTasks } from 'web-nwjs-spoofer/src/fs-misc'
import fs from 'fs'

export interface FileEntry {
    path: string
    uint8Array(): Promise<Uint8Array>
}

async function updateUploadStatusLabel(operation: string, fileCount?: number, allFilesCount?: number) {
    const getText = () => {
        // if (isClearing) return ''

        if (allFilesCount === undefined) {
            if (fileCount === undefined) {
                return operation
            } else {
                return `${operation}: ${fileCount}`
            }
        } else {
            const percentage = allFilesCount == 0 ? 100 : Math.floor((fileCount! / allFilesCount) * 100)
            return `${operation}: ${fileCount} / ${allFilesCount} (${percentage}%)`
        }
    }
    console.log(getText())
}

function getParentDirs(files: FileEntry[]): string[] {
    const paths = window.require('path')
    const dirs = new Set<string>()

    for (const { path } of files) {
        let dirname = paths.dirname(path)
        if (dirname.endsWith('.')) dirname = dirname.slice(0, -1)
        const parent = '/' + dirname
        dirs.add(parent)
    }

    return [...dirs]
}

async function mkdirs(dirs: string[]) {
    dirs.sort((a, b) => a.length - b.length)
    const label = 'creating directories'
    updateUploadStatusLabel(label, 0, dirs.length)

    for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i]
        await fs.promises.mkdir(dir, { recursive: true })
        updateUploadStatusLabel(label, i, dirs.length)
    }
    updateUploadStatusLabel(label, dirs.length, dirs.length)
}

export async function copyFiles(toCopyFiles: FileEntry[], fetchRateLimit: boolean) {
    const dirs = getParentDirs(toCopyFiles)
    await mkdirs(dirs)

    updateUploadStatusLabel('copying', 0, toCopyFiles.length)

    let filesCopied = 0
    const atOnce = fetchRateLimit ? undefined : 1000
    await throttleTasks(
        toCopyFiles,
        async file => {
            const buffer = await file.uint8Array()

            await fs.promises.writeFile(file.path, buffer)
            updateUploadStatusLabel('copying', ++filesCopied, toCopyFiles.length)
        },
        atOnce
    )

    updateUploadStatusLabel('done, uploaded', toCopyFiles.length)
}

export async function zipToFileEntryList(zipData: Uint8Array, addPrefix = ''): Promise<FileEntry[]> {
    updateUploadStatusLabel('uncompressing zip')
    const unzipped: Unzipped = unzipSync(zipData)
    return Object.entries(unzipped)
        .map(([path, data]) => ({
            path: addPrefix + path,
            async uint8Array() {
                return data
            },
        }))
        .filter(({ path }) => !path.endsWith('/'))
}
