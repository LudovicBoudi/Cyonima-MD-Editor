/**
 * Minimal RTF reader used when a paste only offers rich text. It keeps the
 * text and the common character formatting (bold, italic, underline, strike)
 * and turns paragraphs into HTML, which the editor then writes back as
 * Markdown. Everything it does not understand is ignored, never guessed at.
 */

/** True for a payload starting with the RTF signature, e.g. from Word. */
export function looksLikeRtf(text: string): boolean {
  return /^\s*\{\\rtf\d/.test(text)
}

/**
 * Destinations whose content is metadata, not document text. `fldinst` is in
 * the list so a hyperlink's instruction is dropped while its visible result
 * (in the sibling `fldrslt` group) is kept.
 */
const SKIP_DESTINATIONS = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'object',
  'objdata',
  'header',
  'headerl',
  'headerr',
  'headerf',
  'footer',
  'footerl',
  'footerr',
  'footerf',
  'footnote',
  'annotation',
  'fldinst',
  'listtable',
  'listoverridetable',
  'rsidtbl',
  'generator',
  'themedata',
  'colorschememapping',
  'datastore',
  'latentstyles',
  'xmlnstbl',
  'mmathpr',
  'pgptbl',
  'blipuid'
])

const SPECIAL_CHARACTERS: Readonly<Record<string, string>> = {
  tab: '\t',
  emdash: '—',
  endash: '–',
  lquote: '‘',
  rquote: '’',
  ldblquote: '“',
  rdblquote: '”',
  bullet: '•',
  emspace: '\u2003',
  enspace: '\u2002',
  qmspace: '\u2005',
  zwj: '\u200d',
  zwnj: '\u200c'
}

const PARAGRAPH_BREAKS = new Set(['par', 'sect', 'page', 'row'])

const decoder = new TextDecoder('windows-1252')

interface RtfState {
  skip: boolean
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
}

const INITIAL_STATE: RtfState = {
  skip: false,
  bold: false,
  italic: false,
  underline: false,
  strike: false
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function tagsFor(state: RtfState): string[] {
  const tags: string[] = []
  if (state.bold) tags.push('strong')
  if (state.italic) tags.push('em')
  if (state.underline) tags.push('u')
  if (state.strike) tags.push('s')
  return tags
}

/**
 * Converts an RTF payload to simple HTML: paragraphs, line breaks, tabs and
 * character formatting. Returns an empty string when the payload has no text.
 */
export function rtfToHtml(rtf: string): string {
  const paragraphs: string[] = []
  const stack: RtfState[] = []
  let state: RtfState = { ...INITIAL_STATE }
  let current = ''
  let activeTags: string[] = []

  const syncTags = (next: string[]): void => {
    let common = 0
    while (common < activeTags.length && common < next.length && activeTags[common] === next[common]) {
      common++
    }
    for (let index = activeTags.length - 1; index >= common; index--) {
      current += `</${activeTags[index]}>`
    }
    activeTags = activeTags.slice(0, common)
    for (let index = common; index < next.length; index++) {
      current += `<${next[index]}>`
      activeTags.push(next[index])
    }
  }

  const appendText = (value: string): void => {
    if (state.skip || !value) return
    syncTags(tagsFor(state))
    current += escapeHtml(value)
  }

  const flushParagraph = (): void => {
    syncTags([])
    const html = current.trim()
    if (html) paragraphs.push(`<p>${html}</p>`)
    current = ''
  }

  let index = 0
  while (index < rtf.length) {
    const char = rtf[index]

    if (char === '{') {
      stack.push({ ...state })
      index++
      continue
    }

    if (char === '}') {
      const previous = stack.pop()
      state = previous ?? { ...INITIAL_STATE }
      index++
      continue
    }

    if (char === '\r' || char === '\n') {
      // Line breaks in the RTF source are formatting, not document content.
      index++
      continue
    }

    if (char !== '\\') {
      appendText(char)
      index++
      continue
    }

    const next = rtf[index + 1]

    // Control symbols: escaped braces, backslash, non-breaking space, etc.
    if (next === '\\' || next === '{' || next === '}') {
      appendText(next)
      index += 2
      continue
    }
    if (next === '~') {
      appendText('\u00a0')
      index += 2
      continue
    }
    if (next === '_') {
      appendText('-')
      index += 2
      continue
    }
    if (next === '-') {
      index += 2
      continue
    }
    if (next === '*') {
      state = { ...state, skip: true }
      index += 2
      continue
    }
    if (next === "'") {
      const hex = rtf.slice(index + 2, index + 4)
      if (/^[0-9a-f]{2}$/i.test(hex)) {
        appendText(decoder.decode(Uint8Array.of(Number.parseInt(hex, 16))))
        index += 4
      } else {
        index += 2
      }
      continue
    }

    // Control word: letters, then an optional signed numeric parameter.
    let cursor = index + 1
    let word = ''
    while (cursor < rtf.length && /[a-z]/i.test(rtf[cursor])) {
      word += rtf[cursor]
      cursor++
    }

    if (!word) {
      // Unknown control symbol: drop it, keep the following text.
      index += 2
      continue
    }

    let parameter = ''
    if (rtf[cursor] === '-') {
      parameter = '-'
      cursor++
    }
    while (cursor < rtf.length && /[0-9]/.test(rtf[cursor])) {
      parameter += rtf[cursor]
      cursor++
    }
    const numeric = parameter === '' || parameter === '-' ? undefined : Number(parameter)

    // A single space after a control word is its delimiter.
    if (rtf[cursor] === ' ') cursor++

    const lower = word.toLowerCase()

    if (lower === 'u' && numeric !== undefined) {
      const code = numeric < 0 ? numeric + 0x10000 : numeric
      appendText(String.fromCodePoint(code))
      // The numeric parameter is followed by one fallback character.
      if (cursor < rtf.length) cursor++
      index = cursor
      continue
    }

    if (lower === 'plain') {
      state = { ...state, bold: false, italic: false, underline: false, strike: false }
    } else if (lower === 'b') {
      state = { ...state, bold: numeric !== 0 }
    } else if (lower === 'i') {
      state = { ...state, italic: numeric !== 0 }
    } else if (lower === 'ul') {
      state = { ...state, underline: numeric !== 0 }
    } else if (lower === 'strike' || lower === 'striked') {
      state = { ...state, strike: numeric !== 0 }
    } else if (lower === 'ulnone') {
      state = { ...state, underline: false }
    } else if (lower === 'line') {
      if (!state.skip) {
        syncTags(tagsFor(state))
        current += '<br>'
      }
    } else if (PARAGRAPH_BREAKS.has(lower)) {
      flushParagraph()
    } else if (lower === 'cell' || lower === 'nestcell') {
      appendText('\t')
    } else if (SKIP_DESTINATIONS.has(lower)) {
      state = { ...state, skip: true }
    } else if (SPECIAL_CHARACTERS[lower]) {
      appendText(SPECIAL_CHARACTERS[lower])
    }

    index = cursor
  }

  flushParagraph()
  return paragraphs.join('')
}
