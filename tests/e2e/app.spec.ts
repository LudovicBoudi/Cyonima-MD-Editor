import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  launchApp,
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
          autosaveSeconds: 7
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
      } finally {
        await launched.app.close()
      }
    } finally {
      rmSync(workspace.root, { recursive: true, force: true })
    }
  })
})
