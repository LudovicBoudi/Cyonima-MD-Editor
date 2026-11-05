/**
 * Languages bundled with lowlight's `common` set. Values are the identifiers
 * written in Markdown fences; labels are shown in the toolbar.
 */
export const CODE_LANGUAGE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'Aucune' },
  { value: 'plaintext', label: 'Texte brut' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'css', label: 'CSS' },
  { value: 'diff', label: 'Diff' },
  { value: 'go', label: 'Go' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'ini', label: 'INI' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'less', label: 'Less' },
  { value: 'lua', label: 'Lua' },
  { value: 'makefile', label: 'Makefile' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'objectivec', label: 'Objective-C' },
  { value: 'perl', label: 'Perl' },
  { value: 'php', label: 'PHP' },
  { value: 'php-template', label: 'PHP (template)' },
  { value: 'python', label: 'Python' },
  { value: 'python-repl', label: 'Python (REPL)' },
  { value: 'r', label: 'R' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'rust', label: 'Rust' },
  { value: 'scss', label: 'SCSS' },
  { value: 'sql', label: 'SQL' },
  { value: 'swift', label: 'Swift' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'vbnet', label: 'VB.NET' },
  { value: 'wasm', label: 'WebAssembly' },
  { value: 'xml', label: 'HTML / XML' },
  { value: 'yaml', label: 'YAML' },
  { value: 'arduino', label: 'Arduino' }
]

const KNOWN_LANGUAGES = new Set(CODE_LANGUAGE_OPTIONS.map((option) => option.value))

/** True when the language is one of the identifiers offered by the toolbar. */
export function isKnownCodeLanguage(value: string): boolean {
  return KNOWN_LANGUAGES.has(value)
}

/**
 * Options for the current value, keeping an unrecognised language (for example
 * `haskell`) selectable so the fence round-trips unchanged.
 */
export function codeLanguageOptions(
  current: string
): ReadonlyArray<{ value: string; label: string }> {
  if (!current || isKnownCodeLanguage(current)) return CODE_LANGUAGE_OPTIONS
  return [...CODE_LANGUAGE_OPTIONS, { value: current, label: current }]
}
