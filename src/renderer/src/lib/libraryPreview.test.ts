import { describe, expect, it } from 'vitest'
import { libraryPreview } from './libraryPreview'

describe('libraryPreview', () => {
  it('removes heading, emphasis and list markers', () => {
    expect(libraryPreview('# Réunion : sujet\n\n**Date :** 9 novembre\n')).toBe(
      'Réunion : sujet · Date : 9 novembre'
    )
  })

  it('reads list items and links as text', () => {
    expect(libraryPreview('- [ ] Action\n- [Lien](https://x.y) ici', 2)).toBe('Action · Lien ici')
  })

  it('keeps only the requested number of lines', () => {
    expect(libraryPreview('a\n\nb\n\nc', 2)).toBe('a · b')
  })
})
