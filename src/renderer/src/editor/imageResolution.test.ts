import { describe, expect, it } from 'vitest'
import { resolveLocalImages, unresolveLocalImages } from './markdown'

describe('resolveLocalImages', () => {
  it('rewrites relative paths against the document directory', () => {
    const html = '<p><img src="./photo.png" alt="p"></p>'
    expect(resolveLocalImages(html, '/docs/project')).toContain(
      'src="local-file:///docs/project/photo.png"'
    )
  })

  it('rewrites paths with ../ against the document directory', () => {
    const html = '<img src="../img/photo.png">'
    expect(resolveLocalImages(html, '/docs/project/notes')).toContain(
      'src="local-file:///docs/project/img/photo.png"'
    )
  })

  it('keeps absolute paths as-is (prefixed)', () => {
    const html = '<img src="/srv/img/photo.png">'
    expect(resolveLocalImages(html, '/docs/project')).toContain(
      'src="local-file:///srv/img/photo.png"'
    )
  })

  it('leaves remote, data and already-resolved srcs untouched', () => {
    const html =
      '<img src="https://example.com/a.png"><img src="data:image/png;base64,AAAA"><img src="local-file:///x.png">'
    expect(resolveLocalImages(html, '/docs')).toBe(html)
  })
})

describe('unresolveLocalImages', () => {
  it('converts local-file urls back to paths relative to the document dir', () => {
    const html = '<img src="local-file:///docs/project/assets/img.png" alt="p">'
    expect(unresolveLocalImages(html, '/docs/project')).toContain('src="assets/img.png"')
  })

  it('walks up with ../ when the image is outside the document dir', () => {
    const html = '<img src="local-file:///srv/img/photo.png">'
    expect(unresolveLocalImages(html, '/srv/docs/project')).toContain('src="../../img/photo.png"')
  })

  it('falls back to an absolute path when no document dir is known', () => {
    const html = '<img src="local-file:///srv/img/photo.png">'
    expect(unresolveLocalImages(html, null)).toContain('src="/srv/img/photo.png"')
  })

  it('leaves remote and data srcs untouched', () => {
    const html = '<img src="https://example.com/a.png"><img src="data:image/png;base64,AAAA">'
    expect(unresolveLocalImages(html, '/docs')).toBe(html)
  })
})
