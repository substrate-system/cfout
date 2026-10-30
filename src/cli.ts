#!/usr/bin/env node
import { runTestsInWorker } from './index.js'

// Each later flag adds its line here alongside its case in parseArgs.
const USAGE = `Usage: cfout [options]

Reads a bundled ES module from stdin, runs it in the Cloudflare Workers
runtime, and prints its output as TAP.

Options:
  --var <KEY=VALUE>          Variable exposed as globalThis.env.KEY,
                             repeatable
  -h, --help                 Show this help message
`

interface CliArgs {
    help:boolean;
    vars:Record<string, string>;
}

class ArgError extends Error {}

function parseArgs (argv:string[]):CliArgs {
    const args:CliArgs = { help: false, vars: {} }

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
        vars: args.vars,
        stdout: text => { process.stdout.write(text) },
        stderr: text => { process.stderr.write(text) },
    })
    process.exitCode = exitCode
}

main().catch(err => {
    process.stderr.write(`cfout: ${err instanceof Error ? err.stack : err}\n`)
    process.exitCode = 1
})
