import { test, expect } from '@playwright/test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  launchApp,
  openFileInRunningApp,
  sendMenuAction,
  stubMessageBox,
  stubOpenDialog,
  stubSaveDialog
} from './helpers'

function makeWorkspace(): { root: string; profile: string; documents: string } {
  const root = mkdtempSync(join(tmpdir(), 'cyonima-e2e-'))
  const profile = join(root, 'profile')
  const documents = join(root, 'documents')
  mkdirSync(profile, { recursive: true })
  mkdirSync(documents, { recursive: true })
  return { root, profile, documents }
}

test.describe('Cyonima MD Editor', () => {
  test('opens, edits, saves and reopens a Markdown document', async () => {
    const workspace = makeWorkspace()
    const file = join(workspace.documents, 'notes.md')
    writeFileSync(file, '# Projet\n\nPremier paragraphe.\n', 'utf8')

    try {
      const first = await launchApp({ profile: workspace.profile, file })
      try {
        await expect(first.page.locator('.md-editor')).toContainText('Premier paragraphe.')

        await first.page.locator('.md-editor').click()
        await first.page.keyboard.press('Control+End')
        await first.page.keyboard.type(' Ajout E2E')
        await first.page.keyboard.press('Control+S')

        await expect(first.page.locator('.document-name')).not.toHaveClass(/is-dirty/, {
          timeout: 15_000
        })
        await expect
          .poll(() => readFileSync(file, 'utf8'))
          .toContain('Premier paragraphe. Ajout E2E')
      } finally {
        await first.app.close()
      }

      // Reopen from disk with the same profile: the text must come back.
      const second = await launchApp({ profile: workspace.profile, file })
      try {
        await expect(second.page.locator('.md-editor')).toContainText('Ajout E2E')
        await expect(second.page.locator('.document-name')).not.toHaveClass(/is-dirty/)
      } finally {
        await second.app.close()
      }

      const saved = readFileSync(file, 'utf8')
      expect(saved).toContain('# Projet')
      expect(saved).toContain('Ajout E2E')
      expect(saved).not.toContain('<p>')
    } finally {
      rmSync(workspace.root, { recursive: true, force: true })
    }
  })

  test('opens and saves through simulated native dialogs', async () => {
    const workspace = makeWorkspace()
    const source = join(workspace.documents, 'source.md')
    const target = join(workspace.documents, 'saved-as.md')
    writeFileSync(source, '# Source\n\nContenu ouvert par dialogue.\n', 'utf8')

    try {
      const launched = await launchApp({ profile: workspace.profile })
      try {
        await stubOpenDialog(launched.app, source)
        await sendMenuAction(launched.app, 'open')
        await expect(launched.page.locator('.md-editor')).toContainText(
          'Contenu ouvert par dialogue.'
        )

        await stubSaveDialog(launched.app, target)
        await sendMenuAction(launched.app, 'save-as')

        await expect.poll(() => existsSync(target), { timeout: 15_000 }).toBe(true)
        const saved = readFileSync(target, 'utf8')
        expect(saved).toContain('# Source')
        expect(saved).toContain('Contenu ouvert par dialogue.')
        expect(saved).not.toContain('<h1>')
      } finally {
        await launched.app.close()
      }
    } finally {
      rmSync(workspace.root, { recursive: true, force: true })
    }
  })

  test('opens a file sent by a second instance, as a file association would', async () => {
    const workspace = makeWorkspace()
    const file = join(workspace.documents, 'mes notes.md')
    writeFileSync(file, '# Association\n\nOuvert depuis le système.\n', 'utf8')

    try {
      const launched = await launchApp({ profile: workspace.profile })
      try {
        await launched.page.bringToFront()
        await openFileInRunningApp(workspace.profile, pathToFileURL(file).href)
        await expect(launched.page.locator('.md-editor')).toContainText(
          'Ouvert depuis le système.'
        )
        await expect(launched.page.locator('.document-name')).toHaveText('mes notes.md')
      } finally {
        await launched.app.close()
      }
    } finally {
      rmSync(workspace.root, { recursive: true, force: true })
    }
  })

  test('shows the About screen with version, runtime and icon', async () => {
    const workspace = makeWorkspace()

    try {
      const launched = await launchApp({ profile: workspace.profile })
      try {
        await sendMenuAction(launched.app, 'about')
        await expect(launched.page.locator('#about-title')).toContainText('Cyonima MD Editor')
        await expect(launched.page.locator('.about-version')).toContainText(/Version|version/)
        await expect(launched.page.locator('.about-version')).toContainText(/\d+\.\d+\.\d+/)
        await expect(launched.page.locator('.about-runtime')).toContainText('Electron')
        const iconLoaded = await launched.page
          .locator('.about-icon')
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
        expect(iconLoaded).toBe(true)
      } finally {
        await launched.app.close()
      }
    } finally {
      rmSync(workspace.root, { recursive: true, force: true })
    }
  })

  test('exposes the preload API and completes an IPC save', async () => {
    const workspace = makeWorkspace()
    const target = join(workspace.documents, 'ipc.md')

    try {
      const launched = await launchApp({ profile: workspace.profile })
      try {
        const api = await launched.page.evaluate(async () => ({
          keys: Object.keys(window.api).sort(),
          preferences: await window.api.getPreferences(),
          locale: await window.api.getLocale()
        }))

        for (const method of [
          'getInitialDocument',
          'openFile',
          'openFileAt',
          'saveFile',
          'getPreferences',
          'setPreferences',
          'getLocale',
          'onLocaleChanged',
          'getAppInfo',
          'setDefaultEditor',
          'getUpdateState',
          'checkForUpdates',
          'installUpdate',
          'onUpdateStatus',
          'openReleasesPage',
          'reportCrash',
          'openCrashReportsFolder',
          'setDocumentMeta',
          'setOpenPaths',
          'saveAutosave',
          'clearAutosave'
        ]) {
          expect(api.keys).toContain(method)
        }

        expect(api.preferences).toMatchObject({
          reopenLastDocument: true,
          spellCheck: true,
          autosaveSeconds: 7,
          autoUpdate: false,
          updateChannel: 'stable',
          crashReports: false
        })
        expect(['system', 'fr', 'en']).toContain(api.preferences.language)
        expect(['fr', 'en']).toContain(api.locale.language)
        expect(api.locale.systemLocale.length).toBeGreaterThan(0)

        const updated = await launched.page.evaluate(() =>
          window.api.setPreferences({ autosaveSeconds: 3 })
        )
        expect(updated.autosaveSeconds).toBe(3)

        const missing = await launched.page.evaluate(() =>
          window.api.openFileAt('/definitely/not/here.md')
        )
        expect(missing.canceled).toBe(true)

        const updateState = await launched.page.evaluate(() => window.api.getUpdateState())
        expect(updateState.status).toBe('disabled')

        const csp = await launched.page.evaluate(
          () =>
            document
              .querySelector('meta[http-equiv="Content-Security-Policy"]')
              ?.getAttribute('content') ?? ''
        )
        expect(csp).toContain("script-src 'self'")
        expect(csp).toContain("connect-src 'self' local-file:")
        expect(csp).toContain("object-src 'none'")
        expect(csp).toContain("base-uri 'none'")
        expect(csp).toContain("frame-src 'none'")
        expect(csp).toContain("form-action 'none'")
        expect(csp).not.toContain('ws:')
        expect(csp).not.toContain('http:')

        await stubMessageBox(launched.app, 2)
        expect(await launched.page.evaluate(() => window.api.confirmDiscard())).toBe('cancel')
        await stubMessageBox(launched.app, 1)
        expect(await launched.page.evaluate(() => window.api.confirmDiscard())).toBe('discard')

        // Autosave IPC: the file is written, then removed by clearAutosave.
        const autosavePath = join(workspace.profile, 'autosave.json')
        await launched.page.evaluate(() =>
          window.api.saveAutosave([
            {
              id: 'tab-e2e',
              path: null,
              name: 'brouillon.md',
              content: '# Brouillon',
              format: { encoding: 'utf-8', bom: false, eol: 'lf' }
            }
          ])
        )
        await expect.poll(() => existsSync(autosavePath), { timeout: 10_000 }).toBe(true)
        expect(JSON.parse(readFileSync(autosavePath, 'utf8')).documents[0].content).toBe(
          '# Brouillon'
        )
        await launched.page.evaluate(() => window.api.clearAutosave())
        await expect.poll(() => existsSync(autosavePath), { timeout: 10_000 }).toBe(false)

        // Opt-in crash reports redact paths and never include document content.
        await launched.page.evaluate(() => window.api.setPreferences({ crashReports: true }))
        await launched.page.evaluate(() =>
          window.api.reportCrash({
            source: 'renderer',
            name: 'Error',
            message: 'Failed to read /home/ludo/private/notes.md',
            stack: 'Error: failed\n    at /home/ludo/private/app.ts:1:1'
          })
        )
        const reportsDir = join(workspace.profile, 'crash-reports')
        await expect
          .poll(() => (existsSync(reportsDir) ? readdirSync(reportsDir).length : 0), {
            timeout: 10_000
          })
          .toBeGreaterThan(0)
        const reportFile = join(reportsDir, readdirSync(reportsDir)[0])
        const report = readFileSync(reportFile, 'utf8')
        expect(report).toContain('<path>')
        expect(report).not.toContain('/home/ludo')
        await launched.page.evaluate(() => window.api.setPreferences({ crashReports: false }))

        await stubSaveDialog(launched.app, target)
        const result = await launched.page.evaluate(() =>
          window.api.saveFile({
            content: '# Écrit par IPC\n\nTexte.\n',
            path: null,
            saveAs: true,
            format: { encoding: 'utf-8', bom: false, eol: 'lf' }
          })
        )

        expect(result.canceled).toBe(false)
        expect(result.path).toBe(target)
        expect(readFileSync(target, 'utf8')).toContain('# Écrit par IPC')

        // The Preferences screen exposes the default-editor action.
        await sendMenuAction(launched.app, 'preferences')
        await expect(launched.page.locator('#preferences-title')).toBeVisible()
        await expect(launched.page.locator('.preferences-dialog')).toContainText(
          /Fichiers Markdown|Markdown files/
        )
        await expect(launched.page.locator('.preferences-dialog')).toContainText(
          /Mises à jour|Updates/
        )
        await expect(launched.page.locator('.preferences-dialog')).toContainText(
          /Confidentialité|Privacy/
        )
        await expect(
          launched.page.getByRole('button', {
            name: /Définir comme éditeur|Set as the default/
          })
        ).toBeVisible()
        await launched.page.keyboard.press('Escape')
        await expect(launched.page.locator('#preferences-title')).toBeHidden()
      } finally {
        await launched.app.close()
      }
    } finally {
      rmSync(workspace.root, { recursive: true, force: true })
    }
  })
})
