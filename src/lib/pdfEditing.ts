import {
  BlendMode,
  LineCapStyle,
  PDFDocument,
  PDFFont,
  StandardFonts,
  concatTransformationMatrix,
  degrees,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFPage,
} from 'pdf-lib'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { EditObject, FontKey, Rect, TextObject } from '@/types/edit'
import { removeCoveredText } from './pdfRedact'
import { systemFontBytes, systemFontFamily } from './systemFonts'
import fontkit from '@pdf-lib/fontkit'

export const LINE_HEIGHT = 1.2
export const HIGHLIGHT_OPACITY = 0.4

export const CSS_FONTS: Record<FontKey, string> = {
  helvetica: '"Liberation Sans", Arimo, Arial, Helvetica, sans-serif',
  times: '"Liberation Serif", Tinos, "Times New Roman", Times, serif',
  courier: '"Liberation Mono", Cousine, "Courier New", Courier, monospace',
}

export const FONT_LABELS: Record<FontKey, string> = {
  helvetica: 'Sans (Helvetica)',
  times: 'Serif (Times)',
  courier: 'Mono (Courier)',
}

type FontLook = Pick<TextObject, 'font' | 'bold' | 'italic' | 'systemFont'>

// Une police installée est déjà la bonne variante (grasse, italique) : pas de style simulé
export const cssFont = (t: FontLook, size: number) =>
  t.systemFont
    ? `${size}px "${systemFontFamily(t.systemFont)}", ${CSS_FONTS[t.font]}`
    : `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${size}px ${CSS_FONTS[t.font]}`

let measureCtx: CanvasRenderingContext2D | null = null
const ctx = () => (measureCtx ??= document.createElement('canvas').getContext('2d')!)

// Position de la ligne de base dans une ligne CSS de hauteur LINE_HEIGHT, en fraction de la taille de police.
// Sert à placer le texte enregistré exactement là où il apparaît à l'écran.
const baselineCache = new Map<string, number>()
export function baselineRatio(t: FontLook): number {
  const key = `${t.font}${t.bold}${t.italic}${t.systemFont ?? ''}`
  const cached = baselineCache.get(key)
  if (cached !== undefined) return cached
  const c = ctx()
  c.font = cssFont(t, 100)
  const m = c.measureText('Hg')
  const ascent = (m.fontBoundingBoxAscent || 90) / 100
  const descent = (m.fontBoundingBoxDescent || 22) / 100
  const ratio = (LINE_HEIGHT - (ascent + descent)) / 2 + ascent
  baselineCache.set(key, ratio)
  return ratio
}

// La police de remplacement n'a pas la chasse de la police d'origine (DejaVu Sans est 13 % plus large
// qu'Helvetica, par exemple) : on calcule l'étirement qui redonne à la ligne sa largeur d'origine.
export function widthScale(t: FontLook, size: number, text: string, width: number): number {
  const c = ctx()
  c.font = cssFont(t, size)
  const measured = c.measureText(text).width
  if (!measured || !text.trim()) return 1
  const k = width / measured
  return Math.abs(k - 1) < 0.015 ? 1 : clamp(k, 0.75, 1.35)
}

export function textBox(t: TextObject): Rect {
  const c = ctx()
  c.font = cssFont(t, t.fontSize)
  const lines = t.text.split('\n')
  const w = Math.max(t.fontSize * 0.5, ...lines.map((l) => c.measureText(l).width * (t.scaleX ?? 1)))
  return { x: t.x, y: t.y, w, h: lines.length * t.fontSize * LINE_HEIGHT }
}

export function objectBox(o: EditObject): Rect {
  switch (o.type) {
    case 'text':
      return textBox(o)
    case 'image':
    case 'cover':
      return { x: o.x, y: o.y, w: o.w, h: o.h }
    case 'shape':
      return {
        x: Math.min(o.x1, o.x2),
        y: Math.min(o.y1, o.y2),
        w: Math.abs(o.x2 - o.x1),
        h: Math.abs(o.y2 - o.y1),
      }
    case 'ink':
    case 'markup': {
      const pts: Array<[number, number]> =
        o.type === 'ink' ? o.points : o.rects.flatMap((r) => [[r.x, r.y], [r.x + r.w, r.y + r.h]] as Array<[number, number]>)
      const xs = pts.map((p) => p[0])
      const ys = pts.map((p) => p[1])
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
    }
  }
}

// Déplace / redimensionne un objet en projetant sa boîte `from` sur la boîte `to`
export function mapObject(o: EditObject, from: Rect, to: Rect): Partial<EditObject> {
  const sx = from.w ? to.w / from.w : 1
  const sy = from.h ? to.h / from.h : 1
  const mx = (x: number) => to.x + (x - from.x) * sx
  const my = (y: number) => to.y + (y - from.y) * sy
  switch (o.type) {
    case 'text':
      return { x: to.x, y: to.y, fontSize: Math.max(4, o.fontSize * sy) }
    case 'image':
    case 'cover':
      return { x: mx(o.x), y: my(o.y), w: o.w * sx, h: o.h * sy }
    case 'shape':
      return { x1: mx(o.x1), y1: my(o.y1), x2: mx(o.x2), y2: my(o.y2) }
    case 'ink':
      return { points: o.points.map(([x, y]) => [mx(x), my(y)] as [number, number]) }
    case 'markup':
      return { rects: o.rects.map((r) => ({ x: mx(r.x), y: my(r.y), w: r.w * sx, h: r.h * sy })) }
  }
}

// ---------- Couleurs ----------

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

export const hexToRgb = (h: string) => {
  const n = parseInt(h.replace('#', ''), 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

// Lit la couleur du fond (bordure de la zone) et celle du texte (pixels les plus contrastés) sur le rendu de la page
export function sampleColors(canvas: HTMLCanvasElement | null, scale: number, r: Rect): { bg: string; fg: string } {
  const fallback = { bg: '#ffffff', fg: '#000000' }
  if (!canvas) return fallback
  try {
    const ratio = (canvas.width / canvas.clientWidth || 1) * scale
    const pad = 2
    const x0 = Math.max(0, Math.floor((r.x * ratio) - pad))
    const y0 = Math.max(0, Math.floor((r.y * ratio) - pad))
    const x1 = Math.min(canvas.width, Math.ceil((r.x + r.w) * ratio + pad))
    const y1 = Math.min(canvas.height, Math.ceil((r.y + r.h) * ratio + pad))
    const w = x1 - x0
    const h = y1 - y0
    if (w <= 2 || h <= 2) return fallback
    const data = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(x0, y0, w, h).data

    const counts = new Map<number, { n: number; r: number; g: number; b: number }>()
    const px = (i: number) => [data[i], data[i + 1], data[i + 2], data[i + 3]]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x > 0 && x < w - 1 && y > 0 && y < h - 1) continue
        const [cr, cg, cb, ca] = px((y * w + x) * 4)
        if (ca < 10) continue
        const key = ((cr >> 3) << 10) | ((cg >> 3) << 5) | (cb >> 3)
        const e = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
        e.n++
        e.r += cr
        e.g += cg
        e.b += cb
        counts.set(key, e)
      }
    }
    let best = { n: 0, r: 255, g: 255, b: 255 }
    for (const e of counts.values()) if (e.n > best.n) best = e
    const bg = best.n ? [best.r / best.n, best.g / best.n, best.b / best.n] : [255, 255, 255]

    const dist = (i: number) => Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2])
    let max = 0
    for (let i = 0; i < data.length; i += 4) max = Math.max(max, dist(i))
    let fg = [0, 0, 0]
    if (max > 60) {
      let n = 0
      const acc = [0, 0, 0]
      for (let i = 0; i < data.length; i += 4) {
        if (dist(i) < max * 0.75) continue
        acc[0] += data[i]
        acc[1] += data[i + 1]
        acc[2] += data[i + 2]
        n++
      }
      fg = acc.map((v) => v / n)
    }
    return { bg: hex(bg[0], bg[1], bg[2]), fg: hex(fg[0], fg[1], fg[2]) }
  } catch {
    return fallback
  }
}

// ---------- Texte d'origine (mode édition ultra) ----------

export interface SourceLine {
  key: string
  text: string
  x: number
  baseline: number
  right: number
  size: number
  top: number
  bottom: number
  font: FontKey
  bold: boolean
  italic: boolean
  pdfFont: string // nom de la police dans le PDF, pour retrouver la police installée
}

const multiply = (m: number[], n: number[]) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function guessFont(family: string, name: string): Pick<SourceLine, 'font' | 'bold' | 'italic'> {
  const all = `${name} ${family}`.toLowerCase()
  const font: FontKey = /mono|courier|consol|menlo/.test(all)
    ? 'courier'
    : /times|serif|georgia|garamond|cambria|book|roman|minion/.test(all.replace('sans-serif', ''))
      ? 'times'
      : 'helvetica'
  return { font, bold: /bold|black|heavy|semibold|demi/.test(all), italic: /italic|oblique/.test(all) }
}

// Regroupe les fragments de texte pdf.js en lignes éditables (texte horizontal uniquement)
export async function extractSourceLines(page: PDFPageProxy): Promise<SourceLine[]> {
  const vp = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const lines: SourceLine[] = []
  let cur: (SourceLine & { fontName: string }) | null = null

  const flush = () => {
    if (cur && cur.text.trim()) {
      const { fontName: _f, ...line } = cur
      lines.push({ ...line, text: line.text.replace(/\s+$/, ''), key: `${page.pageNumber}:${lines.length}` })
    }
    cur = null
  }

  for (const raw of content.items) {
    if (!('str' in raw)) continue
    const item = raw
    const tx = multiply(vp.transform, item.transform)
    const size = Math.hypot(tx[2], tx[3])
    if (tx[0] <= 0 || Math.abs(tx[1]) > Math.abs(tx[0]) * 0.02 || size < 1) {
      flush()
      continue
    }
    if (!item.str) {
      if (item.hasEOL) flush()
      continue
    }
    const x = tx[4]
    const baseline = tx[5]
    const right = x + item.width
    const c = cur as (SourceLine & { fontName: string }) | null
    const sameLine =
      c &&
      Math.abs(baseline - c.baseline) < size * 0.25 &&
      Math.abs(size - c.size) < size * 0.35 &&
      x > c.right - size * 0.5 &&
      x - c.right < size * 1.5
    if (c && sameLine) {
      if (x - c.right > size * 0.12 && !c.text.endsWith(' ') && !item.str.startsWith(' ')) c.text += ' '
      c.text += item.str
      c.right = Math.max(c.right, right)
    } else {
      flush()
      const style = content.styles[item.fontName] ?? { fontFamily: '', ascent: 0.8, descent: -0.2 }
      let realName = ''
      try {
        realName = (page.commonObjs.get(item.fontName) as { name?: string } | undefined)?.name ?? ''
      } catch {
        /* police pas encore chargée */
      }
      const ascent = clamp(style.ascent || 0.8, 0.6, 1)
      const descent = clamp(style.descent || -0.2, -0.35, -0.1)
      cur = {
        key: '',
        fontName: item.fontName,
        text: item.str,
        x,
        baseline,
        right,
        size,
        top: baseline - ascent * size,
        bottom: baseline - descent * size,
        ...guessFont(style.fontFamily, realName),
        pdfFont: realName,
      }
    }
    if (item.hasEOL) flush()
  }
  flush()
  return lines
}

// ---------- Export ----------

const STANDARD: Record<FontKey, StandardFonts[]> = {
  // [normal, gras, italique, gras italique]
  helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
}

const dataUrlBytes = (src: string) => {
  const b64 = src.slice(src.indexOf(',') + 1)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

// Les polices standard PDF ne couvrent que WinAnsi : on remplace les caractères impossibles à encoder
const encodable = (font: PDFFont, text: string) => {
  const charset = new Set(font.getCharacterSet())
  return Array.from(text)
    .map((ch) => (charset.has(ch.codePointAt(0)!) ? ch : ch === '\t' ? '    ' : '?'))
    .join('')
}

export async function exportEditedPdf(original: Uint8Array, source: PDFDocumentProxy, objects: EditObject[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original, { ignoreEncryption: true })
  const pages = doc.getPages()
  const fonts = new Map<string, PDFFont>()
  const font = async (t: TextObject) => {
    const bytes = t.systemFont ? systemFontBytes(t.systemFont) : undefined
    if (bytes) {
      if (!fonts.has(t.systemFont!)) {
        try {
          doc.registerFontkit(fontkit)
          fonts.set(t.systemFont!, await doc.embedFont(bytes, { subset: true }))
        } catch {
          /* police non intégrable : police standard */
        }
      }
      const embedded = fonts.get(t.systemFont!)
      if (embedded) return embedded
    }
    const name = STANDARD[t.font][(t.bold ? 1 : 0) + (t.italic ? 2 : 0)]
    if (!fonts.has(name)) fonts.set(name, await doc.embedFont(name))
    return fonts.get(name)!
  }
  const isolated = new Set<PDFPage>()

  // Le texte d'origine sous les caches (lignes modifiées, zones effacées) est retiré du fichier
  const coveredPages = new Set(objects.filter((o) => o.type === 'cover').map((o) => o.page))
  for (const num of coveredPages) {
    const page = pages[num - 1]
    if (!page) continue
    const pdfPage = await source.getPage(num)
    const vp = pdfPage.getViewport({ scale: 1 })
    const boxes = objects.flatMap((o) => {
      if (o.type !== 'cover' || o.page !== num) return []
      const [ax, ay] = vp.convertToPdfPoint(o.x, o.y)
      const [bx, by] = vp.convertToPdfPoint(o.x + o.w, o.y + o.h)
      return [{ x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) }]
    })
    await removeCoveredText(doc, page, pdfPage, boxes)
  }

  // Couches dans l'ordre d'affichage : caches, images, dessins, surlignages, textes
  const layer = (o: EditObject) => ({ cover: 0, image: 1, shape: 2, ink: 2, markup: 3, text: 4 })[o.type]
  const ordered = [...objects].sort((a, b) => layer(a) - layer(b))

  for (const o of ordered) {
    const page = pages[o.page - 1]
    if (!page) continue
    // Isole le contenu d'origine (q … Q) pour que nos ajouts ne subissent pas ses transformations
    if (!isolated.has(page)) {
      page.node.normalize()
      const start = doc.context.register(doc.context.contentStream([pushGraphicsState()]))
      const end = doc.context.register(doc.context.contentStream([popGraphicsState()]))
      page.node.wrapContentStreams(start, end)
      isolated.add(page)
    }
    const vp = (await source.getPage(o.page)).getViewport({ scale: 1 })
    const P = (x: number, y: number) => {
      const [px, py] = vp.convertToPdfPoint(x, y)
      return { x: px, y: py }
    }
    const rotate = degrees(vp.rotation)
    const color = (h: string) => {
      const c = hexToRgb(h)
      return rgb(c.r, c.g, c.b)
    }

    switch (o.type) {
      case 'cover':
        page.drawRectangle({ ...P(o.x, o.y + o.h), width: o.w, height: o.h, color: color(o.color), rotate })
        break
      case 'image': {
        const bytes = dataUrlBytes(o.src)
        const img = o.src.startsWith('data:image/jpeg') ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
        page.drawImage(img, { ...P(o.x, o.y + o.h), width: o.w, height: o.h, rotate })
        break
      }
      case 'markup':
        for (const r of o.rects) {
          if (o.kind === 'highlight') {
            page.drawRectangle({
              ...P(r.x, r.y + r.h),
              width: r.w,
              height: r.h,
              color: color(o.color),
              opacity: HIGHLIGHT_OPACITY,
              blendMode: BlendMode.Multiply,
              rotate,
            })
          } else {
            const y = o.kind === 'underline' ? r.y + r.h * 0.94 : r.y + r.h * 0.55
            page.drawLine({ start: P(r.x, y), end: P(r.x + r.w, y), thickness: Math.max(0.8, r.h * 0.07), color: color(o.color) })
          }
        }
        break
      case 'ink':
        for (let i = 1; i < o.points.length; i++) {
          page.drawLine({
            start: P(...o.points[i - 1]),
            end: P(...o.points[i]),
            thickness: o.width,
            color: color(o.color),
            lineCap: LineCapStyle.Round,
          })
        }
        break
      case 'shape': {
        const stroke = { borderColor: color(o.color), borderWidth: o.width }
        const x = Math.min(o.x1, o.x2)
        const y = Math.min(o.y1, o.y2)
        const w = Math.abs(o.x2 - o.x1)
        const h = Math.abs(o.y2 - o.y1)
        if (o.kind === 'rect') {
          page.drawRectangle({ ...P(x, y + h), width: w, height: h, ...stroke, rotate })
        } else if (o.kind === 'ellipse') {
          page.drawEllipse({ ...P(x + w / 2, y + h / 2), xScale: w / 2, yScale: h / 2, ...stroke, rotate })
        } else {
          const line = { thickness: o.width, color: color(o.color), lineCap: LineCapStyle.Round }
          page.drawLine({ start: P(o.x1, o.y1), end: P(o.x2, o.y2), ...line })
          if (o.kind === 'arrow') {
            for (const [hx, hy] of arrowHead(o.x1, o.y1, o.x2, o.y2, o.width)) {
              page.drawLine({ start: P(o.x2, o.y2), end: P(hx, hy), ...line })
            }
          }
        }
        break
      }
      case 'text': {
        const f = await font(o)
        const base = baselineRatio(o) * o.fontSize
        const sx = o.scaleX ?? 1
        const angle = (vp.rotation * Math.PI) / 180
        o.text.split('\n').forEach((line, i) => {
          if (!line) return
          const at = P(o.x, o.y + i * o.fontSize * LINE_HEIGHT + base)
          const options = { size: o.fontSize, font: f, color: color(o.color) }
          if (sx === 1) {
            page.drawText(encodable(f, line), { ...at, ...options, rotate })
            return
          }
          // Repère du texte : origine sur la ligne de base, rotation de la page, étirement horizontal
          const cos = Math.cos(angle)
          const sin = Math.sin(angle)
          page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx * cos, sx * sin, -sin, cos, at.x, at.y))
          page.drawText(encodable(f, line), { x: 0, y: 0, ...options })
          page.pushOperators(popGraphicsState())
        })
        break
      }
    }
  }
  return doc.save()
}

export function arrowHead(x1: number, y1: number, x2: number, y2: number, width: number): Array<[number, number]> {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const len = Math.max(8, width * 4)
  return [angle + Math.PI * 0.85, angle - Math.PI * 0.85].map((a) => [x2 + Math.cos(a) * len, y2 + Math.sin(a) * len])
}
