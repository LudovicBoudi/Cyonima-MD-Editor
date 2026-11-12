import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { Language, PdfExportOptions } from '../shared/types'
import { translate } from '../shared/i18n'
import { writeFileAtomic } from './atomicWrite'
import { embedLocalImages } from './embedImages'

export interface PdfRenderRequest {
  /** Complete print-oriented HTML document. */
  html: string
  /** Directory of the current document, used to resolve relative images. */
  documentDir: string | null
  options: PdfExportOptions
  /** Title printed in the header or, when it is hidden, in the footer. */
  title: string
  targetPath: string
  /** Interface language of the page-number footer. */
  language?: Language
}

/** Chromium renders header and footer templates in the page margins. */
const HEADER_FOOTER_FONT =
  "-apple-system, 'Segoe UI', system-ui, -apple-system, sans-serif"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function headerTemplate(title: string): string {
  return `<div style="width:100%;padding:0 18mm 2mm;box-sizing:border-box;border-bottom:0.5pt solid #d5d0c4;color:#6e6a60;font-family:${HEADER_FOOTER_FONT};font-size:8pt;">
  <span>${escapeHtml(title)}</span>
</div>`
}

function footerTemplate(title: string, showTitle: boolean, language: Language): string {
  // Chromium fills the two spans itself; the translated text keeps its order.
  const template = translate(language, 'pdf.pageNumbers')
  const [before, rest] = template.split('{page}')
  const [middle, after] = (rest ?? '').split('{total}')
  return `<div style="width:100%;padding:2mm 18mm 0;box-sizing:border-box;display:flex;justify-content:space-between;color:#6e6a60;font-family:${HEADER_FOOTER_FONT};font-size:8pt;">
  <span>${showTitle ? escapeHtml(title) : ''}</span>
  <span>${escapeHtml(before ?? '')}<span class="pageNumber"></span>${escapeHtml(middle ?? '')}<span class="totalPages"></span>${escapeHtml(after ?? '')}</span>
</div>`
}

/**
 * Waits for images and web fonts so the first PDF page is not printed while
 * the document is still laying out. The timeout keeps a slow remote image from
 * blocking the export forever.
 */
const WAIT_FOR_ASSETS = `new Promise((resolve) => {
  const finish = () => resolve(true)
  const timeout = setTimeout(finish, 8000)
  const images = Array.from(document.images).map((image) =>
    image.complete
      ? Promise.resolve()
      : new Promise((done) => {
          image.addEventListener('load', done, { once: true })
          image.addEventListener('error', done, { once: true })
        })
  )
  Promise.all(images)
    .then(() => (document.fonts ? document.fonts.ready : null))
    .then(() => {
      clearTimeout(timeout)
      finish()
    })
    .catch(() => {
      clearTimeout(timeout)
      finish()
    })
})`

/**
 * Renders a standalone print page in an invisible window and writes the result
 * as a PDF. The window is isolated from the editor UI so the print stylesheet,
 * page size and margins do not depend on the current screen layout.
 *
 * @returns Names of local images that could not be embedded.
 */
export async function renderPdf(request: PdfRenderRequest): Promise<string[]> {
  const embedded = await embedLocalImages(
    request.html,
    request.documentDir ?? dirname(request.targetPath)
  )

  const temporaryDir = await mkdtemp(join(app.getPath('temp'), 'cyonima-pdf-'))
  const sourcePath = join(temporaryDir, 'document.html')
  await writeFile(sourcePath, embedded.html, 'utf8')

  const printWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  try {
    await printWindow.loadFile(sourcePath)
    await printWindow.webContents.executeJavaScript(WAIT_FOR_ASSETS)

    const withHeader = request.options.header
    const withFooter = request.options.footer
    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: withHeader ? 0.85 : 0.7,
        bottom: withFooter ? 0.8 : 0.7,
        left: 0.7,
        right: 0.7
      },
      displayHeaderFooter: withHeader || withFooter,
      headerTemplate: headerTemplate(request.title),
      footerTemplate: footerTemplate(request.title, !withHeader, request.language ?? 'fr'),
      preferCSSPageSize: false
    })

    await writeFileAtomic(request.targetPath, pdf)
    return embedded.missing
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy()
    await rm(temporaryDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
