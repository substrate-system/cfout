#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { runTestsInWorker, DEFAULT_TIMEOUT } from './index.js'

// Each later flag adds its line here alongside its case in parseArgs.
const USAGE = `Usage: cfout [options]

Reads a bundled ES module from stdin, runs it in the Cloudflare Workers
runtime, and prints its output as TAP.

Options:
  -t, --timeout <ms>         Timeout in milliseconds (default: 5000)
  --compat-date <date>       Workers compatibility date (default: newest
                             the installed runtime supports)
  --compat-flag <name>       Compatibility flag, repeatable
  --var <KEY=VALUE>          Variable exposed as globalThis.env.KEY,
                             repeatable
  --env <path>               .env file of variables, repeatable; --var
                             overrides it
  -h, --help                 Show this help message
`

interface CliArgs {
    help:boolean;
    vars:Record<string, string>;
    /** Variables from --env files, overridden by --var */
    fileVars:Record<string, string>;
    compatDate?:string;
    compatFlags:string[];
    timeout:number;
}

class ArgError extends Error {}

function parseArgs (argv:string[]):CliArgs {
    const args:CliArgs = {
        help: false,
        vars: {},
        fileVars: {},
        compatFlags: [],
        timeout: DEFAULT_TIMEOUT,
    }

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        switch (arg) {
            case '--var': {
                const value = argv[++i]
                if (value === undefined) {
                    throw new ArgError('--var requires a KEY=VALUE argument')
                }
                // split on the first `=`, the value may contain more
                const eq = value.indexOf('=')
                if (eq < 1) {
                    throw new ArgError(
                        `Invalid --var value: ${value} (expected KEY=VALUE)`
                    )
                }
                args.vars[value.slice(0, eq)] = value.slice(eq + 1)
                break
            }
            case '--env':
                // a later file overrides an earlier one
                Object.assign(args.fileVars, readEnvFile(argv[++i]))
                break
            case '--compat-date':
                args.compatDate = parseCompatDate(argv[++i])
                break
            case '--compat-flag': {
                const value = argv[++i]
                if (value === undefined || value === '') {
                    throw new ArgError('--compat-flag requires a name')
                }
                args.compatFlags.push(value)
                break
            }
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

function readEnvFile (filePath:string|undefined):Record<string, string> {
    if (filePath === undefined || filePath === '') {
        throw new ArgError('--env requires a path')
    }
    let text:string
    try {
        text = readFileSync(filePath, 'utf8')
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        throw new ArgError(`Cannot read --env file: ${reason}`)
    }
    return parseEnv(text) as Record<string, string>
}

function parseCompatDate (value:string|undefined):string {
    if (value === undefined) {
        throw new ArgError('--compat-date requires a value')
    }
    // a real calendar day survives the round trip through Date
    const date = new Date(`${value}T00:00:00Z`)
    const valid = (
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(date.getTime()) &&
        date.toISOString().startsWith(value)
    )
    if (!valid) {
        throw new ArgError(
            `Invalid compatibility date: ${value}. Must be YYYY-MM-DD.`
        )
    }
    return value
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
        vars: { ...args.fileVars, ...args.vars },
        compatDate: args.compatDate,
        compatFlags: args.compatFlags,
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
