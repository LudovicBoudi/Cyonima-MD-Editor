import { describe, expect, it } from 'vitest'
import { buildContextMenu, SPELL_LANGUAGE_OPTIONS } from './spellcheck'

const NO_EDIT = { canCut: false, canCopy: false, canPaste: false, canSelectAll: false }
const EDIT = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true }

const handlers = () => ({ replaceWord: () => {}, addWord: () => {} })

describe('spellcheck languages', () => {
  it('offers fr-FR first and has unique codes', () => {
    expect(SPELL_LANGUAGE_OPTIONS[0].code).toBe('fr-FR')
    const codes = SPELL_LANGUAGE_OPTIONS.map((option) => option.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('context menu', () => {
  it('shows suggestions, then add-to-dictionary, then editing commands', () => {
    const items = buildContextMenu(
      {
        misspelledWord: 'bonjoure',
        dictionarySuggestions: ['bonjour', 'bonjours'],
        isEditable: true,
        selectionText: '',
        editFlags: EDIT
      } as never,
      handlers()
    )
    expect(items.slice(0, 2).map((item) => item.label)).toEqual(['bonjour', 'bonjours'])
    expect(items[2].label).toBe('Ajouter « bonjoure » au dictionnaire')
    expect(items[3].type).toBe('separator')
    expect(items.slice(4).map((item) => item.label)).toEqual([
      'Couper',
      'Copier',
      'Coller',
      undefined,
      'Tout sélectionner'
    ])
  })

  it('caps the number of suggestions', () => {
    const items = buildContextMenu(
      {
        misspelledWord: 'xx',
        dictionarySuggestions: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        isEditable: false,
        selectionText: '',
        editFlags: NO_EDIT
      } as never,
      handlers()
    )
    expect(items.filter((item) => item.label && item.label !== 'Ajouter « xx » au dictionnaire')).toHaveLength(6)
  })

  it('says when there is no suggestion', () => {
    const items = buildContextMenu(
      {
        misspelledWord: 'zzz',
        dictionarySuggestions: [],
        isEditable: false,
        selectionText: '',
        editFlags: NO_EDIT
      } as never,
      handlers()
    )
    expect(items[0]).toMatchObject({ label: 'Aucune suggestion', enabled: false })
  })

  it('offers only copy outside editable text with a selection', () => {
    const items = buildContextMenu(
      {
        misspelledWord: '',
        dictionarySuggestions: [],
        isEditable: false,
        selectionText: 'texte',
        editFlags: NO_EDIT
      } as never,
      handlers()
    )
    expect(items).toEqual([{ role: 'copy', label: 'Copier' }])
  })

  it('returns nothing when there is nothing to offer', () => {
    const items = buildContextMenu(
      {
        misspelledWord: '',
        dictionarySuggestions: [],
        isEditable: false,
        selectionText: '',
        editFlags: NO_EDIT
      } as never,
      handlers()
    )
    expect(items).toEqual([])
  })

  it('calls the replace and add handlers', () => {
    const calls: string[] = []
    const items = buildContextMenu(
      {
        misspelledWord: 'bonjoure',
        dictionarySuggestions: ['bonjour'],
        isEditable: true,
        selectionText: '',
        editFlags: EDIT
      } as never,
      {
        replaceWord: (word) => calls.push(`replace:${word}`),
        addWord: (word) => calls.push(`add:${word}`)
      }
    )
    ;(items[0].click as () => void)()
    ;(items[1].click as () => void)()
    expect(calls).toEqual(['replace:bonjour', 'add:bonjoure'])
  })
})
