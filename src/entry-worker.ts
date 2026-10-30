/**
 * One-character prefixes that name the console method a line came from.
 * The worker writes `<prefix><text>\n` into the response body, and Node
 * strips the prefix to route the line.
 */
export const PREFIX = {
    log: 'l',
    info: 'i',
    debug: 'd',
    warn: 'w',
    error: 'e',
    // a control line, the payload is JSON
    control: 'c',
} as const

/**
 * Generate the source of the entry worker. Its fetch handler patches the
 * console to write into a streamed response body, installs the
 * `testsFinished` accessor, then imports the user module.
 *
 * @param userModule Specifier of the user module, relative to the entry
 */
export function entryWorkerSource (userModule:string):string {
    return `
const PREFIX = ${JSON.stringify(PREFIX)}
const METHODS = ['log', 'info', 'debug', 'warn', 'error']

function format (arg) {
    if (typeof arg === 'string') return arg
    if (arg instanceof Error) return arg.stack || String(arg)
    if (typeof arg === 'object' && arg !== null) {
        try {
            return JSON.stringify(arg)
        } catch {
            return String(arg)
        }
    }
    return String(arg)
}

export default {
    async fetch (request, env, ctx) {
        const { readable, writable } = new IdentityTransformStream()
        const writer = writable.getWriter()
        const encoder = new TextEncoder()

        // Stream writes are I/O, which is dropped in global scope, so
        // output made while the user module evaluates is buffered until
        // the import resolves.
        let live = false
        const buffered = []
        let finishRequested = false
        let finished = false
        let resolveDone
        const done = new Promise(resolve => { resolveDone = resolve })
        ctx.waitUntil(done)

        function write (text) {
            if (finished) return
            if (!live) {
                buffered.push(text)
                return
            }
            writer.write(encoder.encode(text)).catch(() => {})
        }

        function emit (prefix, text) {
            write(text.split('\\n').map(line => prefix + line + '\\n').join(''))
        }

        function control (data) {
            emit(PREFIX.control, JSON.stringify(data))
        }

        function finish (reason) {
            if (finished) return
            control({ done: reason })
            finished = true
            writer.close().catch(() => {}).finally(() => resolveDone())
        }

        function goLive () {
            live = true
            for (const text of buffered.splice(0)) write(text)
            if (finishRequested) finish(finishRequested)
        }

        function requestFinish (reason) {
            if (live) return finish(reason)
            finishRequested = finishRequested || reason
        }

        for (const method of METHODS) {
            console[method] = (...args) => {
                emit(PREFIX[method], args.map(format).join(' '))
            }
        }

        // only the value \`true\` ends the run
        let testsFinished = false
        Object.defineProperty(globalThis, 'testsFinished', {
            configurable: true,
            get () { return testsFinished },
            set (value) {
                testsFinished = value
                if (value === true) requestFinish('testsFinished')
            }
        })

        import(${JSON.stringify(userModule)}).then(goLive, goLive)

        return new Response(readable, {
            headers: { 'content-type': 'text/plain; charset=utf-8' }
        })
    }
}
`
}
