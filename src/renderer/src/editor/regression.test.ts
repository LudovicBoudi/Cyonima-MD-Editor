import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  htmlToMarkdown,
  joinFrontmatter,
  markdownToHtml,
  splitFrontmatter
} from './markdown'

const FIXTURES_DIR = join(process.cwd(), 'src/renderer/src/editor/fixtures')

function roundTrip(markdown: string): { once: string; twice: string } {
  const once = htmlToMarkdown(markdownToHtml(markdown))
  const twice = htmlToMarkdown(markdownToHtml(once))
  return { once, twice }
}

function fixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8')
}

describe('fixtures : stabilité sur deux allers-retours', () => {
  const files = readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith('.md'))
    .sort()

  it('trouve les fixtures attendues', () => {
    expect(files.length).toBeGreaterThanOrEqual(7)
  })

  for (const file of files) {
    it(`${file}`, () => {
      const parts = splitFrontmatter(fixture(file))
      const { once, twice } = roundTrip(parts.body)

      expect(once.length).toBeGreaterThan(0)
      expect(twice).toBe(once)
    })
  }
})

describe('cas ciblés', () => {
  it('normalise les fins de ligne CRLF sans introduire de \r', () => {
    const markdown = '# Titre\r\n\r\nCorps.\r\n'
    const { once, twice } = roundTrip(markdown)

    expect(once).not.toContain('\r')
    expect(once).toContain('# Titre')
    expect(once).toContain('Corps.')
    expect(twice).toBe(once)
  })

  it('préserve les retours à la ligne forcés (deux espaces)', () => {
    const markdown = 'ligne un  \nligne deux\n'
    const html = markdownToHtml(markdown)

    expect(html).toContain('<br>')

    const { once, twice } = roundTrip(markdown)
    expect(once).toContain('ligne un')
    expect(once).toContain('ligne deux')
    expect(twice).toBe(once)
  })

  it('préserve les retours à la ligne forcés (antislash)', () => {
    const markdown = 'ligne un\\\nligne deux\n'
    const html = markdownToHtml(markdown)

    expect(html).toContain('<br>')
    expect(roundTrip(markdown).twice).toBe(roundTrip(markdown).once)
  })

  it('reste stable avec une URL contenant des parenthèses', () => {
    const markdown = 'Voir [Set](https://en.wikipedia.org/wiki/Set_(mathematics)).\n'
    const { once, twice } = roundTrip(markdown)

    expect(once).toContain('Set')
    expect(once).toContain('en.wikipedia.org')
    expect(twice).toBe(once)
  })

  it('préserve le titre d’une image', () => {
    const markdown = '![logo](https://example.com/logo.png "Le logo")\n'
    const html = markdownToHtml(markdown)

    expect(html).toContain('alt="logo"')
    expect(html).toContain('title="Le logo"')

    const { once, twice } = roundTrip(markdown)
    expect(once).toContain('logo')
    expect(once).toContain('logo.png')
    expect(twice).toBe(once)
  })

  it('conserve le texte du HTML inline même si la mise en forme est perdue', () => {
    const markdown = 'H<sub>2</sub>O et <kbd>Ctrl</kbd>+<kbd>S</kbd>.\n'
    const { once, twice } = roundTrip(markdown)

    expect(once).toContain('H2O')
    expect(once).toContain('Ctrl')
    expect(twice).toBe(once)
  })

  it('restitue le frontmatter et le corps à l’identique', () => {
    const original = fixture('frontmatter.md')
    const parts = splitFrontmatter(original)
    const restored = joinFrontmatter(parts.frontmatter, htmlToMarkdown(markdownToHtml(parts.body)))

    expect(restored).toBe(original)
  })
})

describe('fuzz : stabilité sur des documents générés', () => {
  const ATOMS = [
    '# Titre de section',
    '## Sous-section',
    'Un paragraphe avec **gras**, *italique* et `code`.',
    'Un [lien](https://example.com) et une ![image](https://example.com/x.png).',
    '- item un\n- item deux\n- item trois',
    '1. premier\n2. second\n3. troisième',
    '- [x] fait\n- [ ] à faire',
    '> Une citation simple.',
    '> niveau un\n>\n> > niveau deux',
    '| A | B |\n| --- | --- |\n| 1 | 2 |',
    '```js\nconst a = 1\nconsole.log(a)\n```',
    '---',
    '<div class="note">\n  bloc html\n</div>',
    'Texte avec emoji 🎉 et accent café.',
    'Un **très** long paragraphe avec plusieurs mots pour vérifier la stabilité.',
    '~~~js\nconst y = 2\n~~~'
  ]

  function makeRandom(seed: number) {
    let state = seed
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff
      return state / 0x7fffffff
    }
  }

  it('ne plante pas et reste stable sur 300 documents aléatoires', () => {
    const rand = makeRandom(20261104)

    for (let iteration = 0; iteration < 300; iteration++) {
      const blockCount = 3 + Math.floor(rand() * 10)
      const blocks: string[] = []
      for (let i = 0; i < blockCount; i++) {
        blocks.push(ATOMS[Math.floor(rand() * ATOMS.length)])
      }
      const document = blocks.join('\n\n')

      const once = htmlToMarkdown(markdownToHtml(document))
      const twice = htmlToMarkdown(markdownToHtml(once))

      expect(typeof once).toBe('string')
      expect(once).not.toContain('undefined')
      expect(once).not.toContain('NaN')
      expect(twice).toBe(once)
    }
  })
})
