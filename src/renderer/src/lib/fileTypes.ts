const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'txt']

/** True when the file name has a Markdown extension. */
export function isMarkdownFileName(name: string): boolean {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  return MARKDOWN_EXTENSIONS.includes(extension)
}
