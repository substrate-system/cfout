#!/usr/bin/env node
import { runTestsInWorker } from './index.js'

async function readStdin ():Promise<string> {
    const chunks:Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString('utf8')
}

async function main () {
    const source = await readStdin()
    const { exitCode } = await runTestsInWorker(source, {
        stdout: text => { process.stdout.write(text) },
        stderr: text => { process.stderr.write(text) },
    })
    process.exitCode = exitCode
}

main().catch(err => {
    process.stderr.write(`cfout: ${err instanceof Error ? err.stack : err}\n`)
    process.exitCode = 1
})
