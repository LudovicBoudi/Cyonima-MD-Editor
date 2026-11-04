import { describe, expect, it } from 'vitest'
import { stampChanged } from './fileStamp'

const A = { mtimeMs: 1000, size: 10 }
const B = { mtimeMs: 1000, size: 10 }

describe('file stamp comparison', () => {
  it('reports no change for identical stamps', () => {
    expect(stampChanged(A, B)).toBe(false)
    expect(stampChanged(null, null)).toBe(false)
  })

  it('detects a changed modification time', () => {
    expect(stampChanged(A, { mtimeMs: 2000, size: 10 })).toBe(true)
  })

  it('detects a changed size', () => {
    expect(stampChanged(A, { mtimeMs: 1000, size: 11 })).toBe(true)
  })

  it('detects creation and deletion', () => {
    expect(stampChanged(A, null)).toBe(true)
    expect(stampChanged(null, A)).toBe(true)
  })
})
