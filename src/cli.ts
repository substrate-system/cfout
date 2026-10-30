#!/usr/bin/env node
import { runTestsInWorker, DEFAULT_TIMEOUT } from './index.js'

// Each later flag adds its line here alongside its case in parseArgs.
const USAGE = `Usage: cfout [options]

Reads a bundled ES module from stdin, runs it in the Cloudflare Workers
runtime, and prints its output as TAP.

Options:
  -t, --timeout <ms>         Timeout in milliseconds (default: 5000)
  -h, --help                 Show this help message
`

interface CliArgs {
    help:boolean;
    timeout:number;
}

class ArgError extends Error {}

function parseArgs (argv:string[]):CliArgs {
    const args:CliArgs = { help: false, timeout: DEFAULT_TIMEOUT }

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        switch (arg) {
            case '-t':
            case '--timeout':
                args.timeout = parseTimeout(arg, argv[++i])
                break
            case '-h':
            case '--help':
                args.help = true
                break
            default:
                throw new ArgError(`Unknown option: ${arg}`)
        }
    }

    return args
}

function parseTimeout (flag:string, value:string|undefined):number {
    if (value === undefined) {
        throw new ArgError(`${flag} requires a value`)
    }
    const ms = Number(value)
    if (value.trim() === '' || !Number.isInteger(ms) || ms <= 0) {
        throw new ArgError(
            `Invalid timeout: ${value}. Must be a positive integer.`
        )
    }
    return ms
}

async function readStdin ():Promise<string> {
    const chunks:Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString('utf8')
}

async function main () {
    let args:CliArgs
    try {
        args = parseArgs(process.argv.slice(2))
    } catch (err) {
        if (!(err instanceof ArgError)) throw err
        process.stderr.write(`Error: ${err.message}\n\n${USAGE}`)
        process.exitCode = 1
        return
    }

    if (args.help) {
        process.stdout.write(USAGE)
        return
    }

    const source = await readStdin()
    const { exitCode } = await runTestsInWorker(source, {
        stdout: text => { process.stdout.write(text) },
        stderr: text => { process.stderr.write(text) },
        timeout: args.timeout,
    })
    process.exitCode = exitCode
}

main().catch(err => {
    process.stderr.write(`cfout: ${err instanceof Error ? err.stack : err}\n`)
    process.exitCode = 1
})
