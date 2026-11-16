#!/usr/bin/env node
/**
 * Generates a CycloneDX 1.5 SBOM from package-lock.json.
 *
 * The runtime graph is included by default (the dependency surface shipped in
 * the application). Pass `--all` to include development dependencies too.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const all = process.argv.includes('--all')
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

function packageName(path) {
  const marker = 'node_modules/'
  const at = path.lastIndexOf(marker)
  return at >= 0 ? path.slice(at + marker.length) : path
}

const components = []
const seen = new Set()
for (const [path, info] of Object.entries(lock.packages ?? {})) {
  if (!path || !info.version) continue
  if (!all && info.dev) continue
  const name = packageName(path)
  const purl = `pkg:npm/${encodeURIComponent(name)}@${info.version}`
  if (seen.has(purl)) continue
  seen.add(purl)
  components.push({
    type: 'library',
    'bom-ref': purl,
    name,
    version: info.version,
    purl,
    ...(info.dev ? { scope: 'optional' } : { scope: 'required' })
  })
}

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: { components: [{ type: 'application', name: 'cyonima-md-editor-sbom' }] },
    component: {
      type: 'application',
      name: manifest.name,
      version: manifest.version
    }
  },
  components
}

const output = join(root, 'sbom.cdx.json')
writeFileSync(output, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8')
console.log(`Wrote ${components.length} components to ${output}`)
