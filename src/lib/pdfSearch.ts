import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface PageText {
  // Texte de la page en minuscules, items concaténés
  text: string
  // itemIndex (tel que vu par react-pdf) -> position de début dans `text`
  itemStarts: Map<number, number>
}

export interface SearchMatch {
  index: number
  page: number
  start: number
  end: number
}

export async function extractPageTexts(pdf: PDFDocumentProxy): Promise<PageText[]> {
  const pages: PageText[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    let text = ''
    const itemStarts = new Map<number, number>()
    content.items.forEach((item, itemIndex) => {
      if (!('str' in item)) return
      itemStarts.set(itemIndex, text.length)
      // Garder la même longueur que la chaîne d'origine pour que les positions restent valides
      const lower = item.str.toLowerCase()
      text += lower.length === item.str.length ? lower : item.str
      if (item.hasEOL) text += ' '
    })
    pages.push({ text, itemStarts })
  }
  return pages
}

export function findMatches(pages: PageText[], query: string): SearchMatch[] {
  const q = query.toLowerCase()
  const matches: SearchMatch[] = []
  if (!q) return matches
  pages.forEach((page, i) => {
    let pos = page.text.indexOf(q)
    while (pos !== -1) {
      matches.push({ index: matches.length, page: i + 1, start: pos, end: pos + q.length })
      pos = page.text.indexOf(q, pos + q.length)
    }
  })
  return matches
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Construit un customTextRenderer react-pdf qui entoure les occurrences de <mark>
export function createHighlightRenderer(pages: PageText[], matches: SearchMatch[], activeIndex: number) {
  const byPage = new Map<number, SearchMatch[]>()
  for (const m of matches) {
    const list = byPage.get(m.page)
    if (list) list.push(m)
    else byPage.set(m.page, [m])
  }

  return ({ str, pageNumber, itemIndex }: { str: string; pageNumber: number; itemIndex: number }) => {
    const itemStart = pages[pageNumber - 1]?.itemStarts.get(itemIndex)
    const pageMatches = byPage.get(pageNumber)
    if (itemStart === undefined || !pageMatches || !str) return escapeHtml(str)

    const itemEnd = itemStart + str.length
    let html = ''
    let cursor = 0
    for (const m of pageMatches) {
      if (m.end <= itemStart || m.start >= itemEnd) continue
      const s = Math.max(m.start, itemStart) - itemStart
      const e = Math.min(m.end, itemEnd) - itemStart
      const cls = m.index === activeIndex ? 'search-match search-match-active' : 'search-match'
      html += escapeHtml(str.slice(cursor, s)) + `<mark class="${cls}">${escapeHtml(str.slice(s, e))}</mark>`
      cursor = e
    }
    return html + escapeHtml(str.slice(cursor))
  }
}
