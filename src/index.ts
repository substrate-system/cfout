import { createRequire } from 'node:module'
import type { Readable } from 'node:stream'
import { Miniflare, NoOpLog } from 'miniflare'
import { entryWorkerSource, PREFIX } from './entry-worker.js'

export type Writer = (text:string) => void

export interface RunOptions {
    stdout?:Writer;
    stderr?:Writer;
    /** String variables, visible to the test as `globalThis.env` */
    vars?:Record<string, string>;
}

export interface CompletionSummary {
    /** How the run ended, or null if the body ended without completing */
    reason:string|null;
    /** Number of `not ok` lines seen on stdout */
    notOk:number;
    /** Number of `console.error` calls */
    consoleErrors:number;
}

export interface RunResult {
    exitCode:0|1;
    summary:CompletionSummary;
}

// Module paths must sit under a non-root directory, a root-level module
// path makes workerd fail to start.
const MODULES_ROOT = '/cfout'
const ENTRY_PATH = `${MODULES_ROOT}/entry.js`
const USER_PATH = `${MODULES_ROOT}/test.js`

const NOT_OK = /^\s*not ok\b/

/**
 * Run an already-bundled ES module inside workerd and stream its console
 * output through the given writers.
 */
export async function runTestsInWorker (
    source:string,
    options:RunOptions = {}
):Promise<RunResult> {
    const stdout = options.stdout ?? (() => {})
    const stderr = options.stderr ?? (() => {})

    const mf = new Miniflare({
        modulesRoot: MODULES_ROOT,
        modules: [
            {
                type: 'ESModule',
                path: ENTRY_PATH,
                contents: entryWorkerSource('./test.js'),
            },
            { type: 'ESModule', path: USER_PATH, contents: source },
        ],
        bindings: options.vars ?? {},
        compatibilityDate: newestCompatDate(),
        log: new NoOpLog(),
        handleRuntimeStdio (runtimeOut:Readable, runtimeErr:Readable) {
            // workerd's own stdout is not ours to print, stdout is for TAP
            runtimeOut.resume()
            runtimeErr.on('data', (chunk:Buffer) => {
                stderr(chunk.toString())
            })
        },
    })

    const summary:CompletionSummary = {
        reason: null,
        notOk: 0,
        consoleErrors: 0,
    }

    function handleLine (line:string) {
        const prefix = line[0]
        const text = line.slice(1)
        switch (prefix) {
            case PREFIX.log:
            case PREFIX.info:
            case PREFIX.debug:
                if (NOT_OK.test(text)) summary.notOk++
                stdout(text + '\n')
                break
            case PREFIX.warn:
                stderr(text + '\n')
                break
            case PREFIX.error:
                summary.consoleErrors++
                stderr(text + '\n')
                break
            case PREFIX.control: {
                const data = JSON.parse(text) as { done?:string }
                if (data.done) summary.reason = data.done
                break
            }
        }
    }

    try {
        const res = await mf.dispatchFetch('http://localhost/')
        if (res.body) {
            const decoder = new TextDecoder()
            let rest = ''
            for await (const chunk of res.body) {
                rest += decoder.decode(chunk, { stream: true })
                const lines = rest.split('\n')
                rest = lines.pop() ?? ''
                for (const line of lines) handleLine(line)
            }
            rest += decoder.decode()
            if (rest) handleLine(rest)
        }
    } finally {
        await mf.dispose()
    }

    const passed = (
        summary.reason !== null &&
        summary.notOk === 0 &&
        summary.consoleErrors === 0
    )

    return { exitCode: passed ? 0 : 1, summary }
}

/**
 * The newest compatibility date the installed workerd supports, derived
 * from miniflare's version string: `4.20260702.0` means `2026-07-02`.
 */
export function newestCompatDate ():string {
    const require = createRequire(import.meta.url)
    const { version } = require('miniflare/package.json') as {
        version:string
    }
    const date = version.split('.')[1]
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}
