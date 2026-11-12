import { describe, expect, it } from 'vitest'
import { createTranslator } from '../../../shared/i18n'
import { buildMarkdownSyntax, buildShortcutGroups, MARKDOWN_SYNTAX, SHORTCUT_GROUPS } from './shortcuts'

describe('shortcut reference', () => {
  it('lists every group with unique labels and keys', () => {
    for (const group of SHORTCUT_GROUPS) {
      expect(group.entries.length).toBeGreaterThan(0)
      const labels = group.entries.map((entry) => entry.label)
      expect(new Set(labels).size).toBe(labels.length)
      for (const entry of group.entries) expect(entry.keys.trim()).not.toBe('')
    }
  })

  it('translates labels and key names into English', () => {
    const groups = buildShortcutGroups(createTranslator('en'), 'en')
    const keys = groups.flatMap((group) => group.entries.map((entry) => entry.keys))
    expect(groups[0].title).toBe('File')
    expect(keys).toContain('Ctrl+Shift+N')
    expect(keys).toContain('Shift+Enter')
    expect(keys).toContain('Ctrl+/ or F1')
    expect(buildMarkdownSyntax(createTranslator('en'), 'en')[0]).toEqual({
      label: 'Heading',
      keys: '# Heading'
    })
  })

  it('documents the help shortcuts and the core Markdown syntax', () => {
    const keys = SHORTCUT_GROUPS.flatMap((group) => group.entries.map((entry) => entry.keys))
    expect(keys).toContain('Ctrl+/ ou F1')
    expect(MARKDOWN_SYNTAX.map((entry) => entry.keys)).toEqual(
      expect.arrayContaining(['# Titre', '```js', '**gras**  *italique*  ~~barré~~'])
    )
  })
})
