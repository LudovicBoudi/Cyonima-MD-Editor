#!/usr/bin/env node
/**
 * Performance benchmark for the Electron application.
 *
 * Opens generated documents of 1 000, 10 000 and 50 000 lines in the real app,
 * then measures cold start, typing latency, search and an in-place save through
 * the Chrome DevTools Protocol.
 *
 * Usage:
 *   npm run build
 *   npm run benchmark                 # 1k, 10k, 50k
 *   node scripts/benchmark.mjs 10000  # one size
 *   node scripts/benchmark.mjs --json # full JSON on stdout
 *
 * The app runs with an isolated temporary user-data directory through the
 * CYONIMA_USER_DATA environment variable, so no real preference, history or
 * autosave file is touched.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const WebSocket = require('ws')
const electron = require('electron')
const APP = dirname(dirname(fileURLToPath(import.meta.url)))
const DEFAULT_SIZES = [1000, 10000, 50000]
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (!existsSync(join(APP, 'out/main/index.js'))) {
  console.error('Build first: npm run build')
  process.exit(1)
}

const args = process.argv.slice(2)
const jsonOnly = args.includes('--json')
const sizes = args.map(Number).filter((value) => Number.isFinite(value) && value > 0)
const RUN_SIZES = sizes.length > 0 ? sizes : DEFAULT_SIZES

function makeDocument(targetLines) {
  const lines = [`# Benchmark ${targetLines}`, '']
  let index = 1
  while (lines.length < targetLines) {
    lines.push(`## Section ${index}`, '')
    lines.push(
      `Paragraph ${index}: lorem ipsum dolor sit amet, consectetur adipiscing elit. Benchmark search term appears here.`,
      ''
    )
    index += 1
  }
  lines.length = targetLines
  return lines.join('\n')
}

/** Waits for a real page target: the DevTools server may answer with only the browser target first. */
const getPageTarget = async (url) => {
  for (let i = 0; i < 200; i++) {
    await sleep(100)
    try {
      const targets = await (await fetch(url)).json()
      const page = targets.find((target) => target.type === 'page')
      if (page) return page
    } catch {
      // DevTools endpoint not ready yet.
    }
  }
  throw new Error(`timeout: ${url}`)
}

const connect = (url) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const pending = new Map()
    let id = 0
    ws.on('message', (message) => {
      const data = JSON.parse(message)
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data)
        pending.delete(data.id)
      }
    })
    ws.on('open', () =>
      resolve({
        ws,
        send: (method, params = {}) =>
          new Promise((done) => {
            const requestId = ++id
            pending.set(requestId, done)
            ws.send(JSON.stringify({ id: requestId, method, params }))
          })
      })
    )
    ws.on('error', reject)
  })

const evaluate = async (client, expression) => {
  const response = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (response.error) throw new Error(response.error.message)
  const details = response.exceptionDetails ?? response.result?.exceptionDetails
  if (details) throw new Error(details.exception?.description ?? JSON.stringify(details))
  return response.result?.result?.value
}

function stopChild(child) {
  try {
    if (process.platform === 'win32') child.kill('SIGKILL')
    else process.kill(-child.pid, 'SIGKILL')
  } catch {
    // Already stopped.
  }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

async function runSize(size, port) {
  const workDir = mkdtempSync(join(tmpdir(), `cyonima-bench-${size}-`))
  const userData = join(workDir, 'profile')
  const docDir = join(workDir, 'documents')
  mkdirSync(userData, { recursive: true })
  mkdirSync(docDir, { recursive: true })

  const file = join(docDir, `bench-${size}.md`)
  const markdown = makeDocument(size)
  writeFileSync(file, markdown, 'utf8')

  const started = Date.now()
  const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${port}`, APP, file], {
    env: { ...process.env, CYONIMA_USER_DATA: userData },
    stdio: 'ignore',
    detached: true
  })

  const exited = new Promise((resolve) => child.once('exit', resolve))
  let client
  try {
    const page = await getPageTarget(`http://127.0.0.1:${port}/json/list`)
    client = await connect(page.webSocketDebuggerUrl)
    await client.send('Performance.enable')

    for (let i = 0; i < 1200; i++) {
      if (await evaluate(client, `!!document.querySelector('.md-editor')`)) break
      await sleep(50)
    }
    const spawnToEditor = Date.now() - started
    await sleep(500)

    const boot = await evaluate(
      client,
      `(() => {
        const marks = performance.getEntriesByType('mark')
        const find = (name) => marks.find((mark) => mark.name === name)?.startTime ?? null
        return {
          rendererBoot: find('cyonima:renderer-boot'),
          documentLoaded: find('cyonima:document-loaded'),
          editorReady: find('cyonima:editor-ready'),
          editorBoot: performance.getEntriesByName('cyonima:editor-boot')[0]?.duration ?? null,
          domNodes: document.getElementsByTagName('*').length
        }
      })()`
    )

    await evaluate(
      client,
      `(() => {
        const editor = document.querySelector('.md-editor')
        editor.focus()
        const selection = window.getSelection()
        selection.selectAllChildren(editor)
        selection.collapseToEnd()
        return true
      })()`
    )

    const typing = []
    for (let i = 0; i < 6; i++) {
      const ms = await evaluate(
        client,
        `(async () => {
          const start = performance.now()
          document.execCommand('insertText', false, 'x')
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          return performance.now() - start
        })()`
      )
      typing.push(ms)
    }

    const search = await evaluate(
      client,
      `(window.__benchSearch = (async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }))
        let input = null
        for (let i = 0; i < 40 && !input; i++) {
          await wait(25)
          input = document.querySelector('.find-input')
        }
        if (!input) return { error: 'no-input' }
        input.focus()
        const start = performance.now()
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, 'benchmark')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        let counter = ''
        const deadline = performance.now() + 15000
        while (performance.now() < deadline) {
          counter = document.querySelector('.find-counter')?.textContent ?? ''
          if (counter.includes('/')) break
          await wait(10)
        }
        const elapsed = performance.now() - start
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
        return { ms: elapsed, counter: counter.trim(), timedOut: !counter.includes('/') }
      })())`
    )

    // In-place save: Markdown conversion, version history copy, atomic write.
    const saveMs = await evaluate(
      client,
      `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
        const start = performance.now()
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
        const deadline = performance.now() + 120000
        while (performance.now() < deadline) {
          if (!document.querySelector('.document-name')?.classList.contains('is-dirty')) {
            return performance.now() - start
          }
          await wait(20)
        }
        return -1
      })()`
    )

    const metrics = await client.send('Performance.getMetrics')
    const metric = (name) => metrics.result?.metrics?.find((entry) => entry.name === name)?.value ?? null

    return {
      size,
      bytes: Buffer.byteLength(markdown),
      spawnToEditor,
      editorBoot: boot.editorBoot,
      documentLoaded: boot.documentLoaded,
      domNodes: boot.domNodes,
      typingMs: typing,
      typingMedianMs: median(typing),
      search,
      saveMs,
      heapMB: metric('JSHeapUsedSize') ? Math.round((metric('JSHeapUsedSize') / 1048576) * 10) / 10 : null
    }
  } finally {
    try {
      client?.ws.close()
    } catch {
      // Already closed.
    }
    stopChild(child)
    await Promise.race([exited, sleep(3000)])
    rmSync(workDir, { recursive: true, force: true })
  }
}

const results = []
for (const [index, size] of RUN_SIZES.entries()) {
  results.push(await runSize(size, 9452 + index))
}

if (jsonOnly) {
  console.log(JSON.stringify(results, null, 2))
} else {
  console.log('')
  console.log('Size     Input     Open      Editor    Type p50   Search    Save      Heap')
  console.log('-------  --------  --------  --------  ---------  --------  --------  ------')
  for (const result of results) {
    const size = `${result.size}`.padStart(5).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    const input = `${Math.round(result.bytes / 1024)} KB`.padStart(7)
    const open = `${Math.round(result.spawnToEditor)} ms`.padStart(7)
    const editor = `${Math.round(result.editorBoot)} ms`.padStart(7)
    const typing = `${Math.round(result.typingMedianMs)} ms`.padStart(8)
    const search = result.search?.ms != null ? `${Math.round(result.search.ms)} ms`.padStart(7) : '    n/a'
    const save = result.saveMs >= 0 ? `${Math.round(result.saveMs)} ms`.padStart(7) : '    n/a'
    const heap = `${result.heapMB ?? '?'} MB`.padStart(5)
    console.log(`${size}  ${input}  ${open}  ${editor}  ${typing}  ${search}  ${save}  ${heap}`)
  }
  console.log('')
}
