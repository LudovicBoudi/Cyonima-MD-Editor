import { describe, expect, it } from 'vitest'
import { releaseNotesText, updateChannelName } from '../shared/updates'

describe('updateChannelName', () => {
  it('maps the stable preference to the latest feed', () => {
    expect(updateChannelName('stable')).toBe('latest')
  })

  it('maps the beta preference to the beta feed', () => {
    expect(updateChannelName('beta')).toBe('beta')
  })
})

describe('releaseNotesText', () => {
  it('returns null without notes', () => {
    expect(releaseNotesText(null)).toBeNull()
    expect(releaseNotesText(undefined)).toBeNull()
    expect(releaseNotesText('')).toBeNull()
  })

  it('turns HTML notes into plain text', () => {
    expect(releaseNotesText('<p>Corrections <strong>importantes</strong></p><ul><li>Stabilité</li></ul>')).toBe(
      'Corrections importantes\nStabilité'
    )
  })

  it('decodes common HTML entities', () => {
    expect(releaseNotesText('Markdown &amp; sécurité')).toBe('Markdown & sécurité')
  })

  it('joins the full changelog when the updater returns several versions', () => {
    const notes = [
      { version: '0.2.0', note: '- Nouveauté' },
      { version: '0.1.1', note: '- Correctif' }
    ]
    expect(releaseNotesText(notes)).toBe('0.2.0\n- Nouveauté\n\n0.1.1\n- Correctif')
  })
})
