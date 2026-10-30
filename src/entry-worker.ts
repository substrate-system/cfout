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
const STDOUT = [PREFIX.log, PREFIX.info, PREFIX.debug]
const TEST_POINT = /^(not )?ok\\b/
const PLAN = /^1\\.\\.(\\d+)(\\s*#.*)?$/

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
            // nothing after the end of the run is printed
            if (finished || (finishRequested && !live)) return
            if (!live) {
                buffered.push(text)
                return
            }
            writer.write(encoder.encode(text)).catch(() => {})
        }

        function emit (prefix, text) {
            const lines = text.split('\\n')
            write(lines.map(line => prefix + line + '\\n').join(''))
            if (STDOUT.includes(prefix)) lines.forEach(trackPlan)
        }

        // Completion by TAP plan. Only top-level lines count, indented
        // subtest plans and test points are ignored.
        let planned = null
        let seen = 0
        function trackPlan (line) {
            if (finished || finishRequested) return
            if (TEST_POINT.test(line)) {
                seen++
                if (planned !== null && seen >= planned) {
                    requestFinish('plan')
                }
                return
            }
            const match = line.match(PLAN)
            if (!match || planned !== null) return
            planned = Number(match[1])
            // a plan after the test points ends the run at once, a plan
            // before them waits for N test points
            if (seen > 0 || planned === 0) requestFinish('plan')
        }

        function control (data) {
            emit(PREFIX.control, JSON.stringify(data))
        }

        function finish (reason) {
            if (finished) return
            if (planned !== null && planned !== seen) {
                // written directly so it is not counted as a test point
                write(\`\${PREFIX.log}not ok - planned \${planned} tests\` +
                    \` but ran \${seen}\\n\`)
            }
            control({ done: reason })
            finished = true
            writer.close().catch(() => {}).finally(() => resolveDone())
        }

        // Global scope forbids timers, so calls made while the user
        // module evaluates are queued and replayed with the real timers
        // once the import resolves, inside the request.
        // bound, since workerd rejects a call with another \`this\`
        const real = {
            setTimeout: globalThis.setTimeout.bind(globalThis),
            setInterval: globalThis.setInterval.bind(globalThis),
            clearTimeout: globalThis.clearTimeout.bind(globalThis),
            clearInterval: globalThis.clearInterval.bind(globalThis),
        }
        // queued calls get negative ids so they never collide with real
        // ones; replayed maps them to the id of the real timer
        let nextId = -1
        const queued = new Map()
        const replayed = new Map()
        for (const name of ['setTimeout', 'setInterval']) {
            globalThis[name] = (fn, ms, ...args) => {
                const id = nextId--
                queued.set(id, [name, fn, ms, args])
                return id
            }
        }
        // the clear functions stay wrapped, so an id handed out at top
        // level still works after the replay
        for (const name of ['clearTimeout', 'clearInterval']) {
            globalThis[name] = (id) => {
                if (queued.delete(id)) return
                return real[name](replayed.has(id) ? replayed.get(id) : id)
            }
        }

        function replayTimers () {
            globalThis.setTimeout = real.setTimeout
            globalThis.setInterval = real.setInterval
            const calls = [...queued]
            queued.clear()
            for (const [id, [name, fn, ms, args]] of calls) {
                replayed.set(id, real[name](() => {
                    try {
                        fn(...args)
                    } catch {
                        // a throw here would cancel the request
                    }
                }, ms))
            }
        }

        function goLive () {
            live = true
            replayTimers()
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

        // test code reads its --var values the way a worker would name them
        globalThis.env = env

        import(${JSON.stringify(userModule)}).then(goLive, goLive)

        return new Response(readable, {
            headers: { 'content-type': 'text/plain; charset=utf-8' }
        })
    }
}
`
}
