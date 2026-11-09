import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATES, expandPlaceholders } from '../../../shared/templates'
import { htmlToMarkdown, markdownToHtml } from '../editor/markdown'

const NOON = new Date(2026, 10, 9, 14, 5)

describe('default templates', () => {
  it.each(Object.entries(DEFAULT_TEMPLATES))('%s survives a Markdown round-trip unchanged', (_, content) => {
    const expanded = expandPlaceholders(content, NOON)
    expect(htmlToMarkdown(markdownToHtml(expanded))).toBe(expanded)
  })
})
