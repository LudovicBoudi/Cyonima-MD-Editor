/**
 * Raw HTML is stored in a data attribute so it can travel through the editor
 * document without ever being interpreted as markup. Percent-encoding keeps
 * quotes, newlines and angle brackets safe inside the attribute.
 */
export function encodeRawHtml(source: string): string {
  return encodeURIComponent(source)
}

export function decodeRawHtml(value: string | null | undefined): string {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
