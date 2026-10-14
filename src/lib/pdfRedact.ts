import { PDFArray, PDFName, PDFRawStream, PDFStream, decodePDFRawStream, type PDFDocument, type PDFPage } from 'pdf-lib'
import type { PDFPageProxy } from 'pdfjs-dist'

// Supprime réellement du flux de contenu les textes d'origine recouverts par l'édition ultra,
// pour que l'ancien texte ne soit plus ni copiable ni extractible.
//
// Prudence avant tout : un opérateur de texte n'est retiré que si toute l'étendue du texte qu'il
// affiche (mesurée par pdf.js) tient dans une zone recouverte. Dans le doute, on le garde : il reste
// alors caché visuellement par le cache, comme avant.

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

type Matrix = number[]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

// A puis B (convention PDF, vecteurs lignes)
const mul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
]

// ---------- Lecture du flux de contenu ----------

interface Op {
  name: string
  operands: Array<number | null>
  start: number // début du premier opérande
  end: number // fin de l'opérateur
}

const WHITE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20])
const DELIM = new Set('()<>[]{}/%'.split('').map((c) => c.charCodeAt(0)))

function parseOps(src: Uint8Array): Op[] {
  const ops: Op[] = []
  const n = src.length
  let i = 0
  let operands: Array<number | null> = []
  let start = -1
  let depth = 0 // tableaux et dictionnaires imbriqués

  const operand = (value: number | null, at: number) => {
    if (start < 0) start = at
    if (depth === 0) operands.push(value)
  }

  while (i < n) {
    const c = src[i]
    if (WHITE.has(c)) {
      i++
    } else if (c === 0x25 /* % */) {
      while (i < n && src[i] !== 0x0a && src[i] !== 0x0d) i++
    } else if (c === 0x28 /* ( */) {
      const at = i
      let nest = 0
      for (; i < n; i++) {
        if (src[i] === 0x5c /* \ */) i++
        else if (src[i] === 0x28) nest++
        else if (src[i] === 0x29 && --nest === 0) break
      }
      i++
      operand(null, at)
    } else if (c === 0x3c /* < */ && src[i + 1] === 0x3c) {
      if (start < 0) start = i
      depth++
      i += 2
    } else if (c === 0x3e /* > */ && src[i + 1] === 0x3e) {
      depth--
      i += 2
      if (depth === 0) operands.push(null)
    } else if (c === 0x3c) {
      const at = i
      while (i < n && src[i] !== 0x3e) i++
      i++
      operand(null, at)
    } else if (c === 0x5b /* [ */) {
      if (start < 0) start = i
      depth++
      i++
    } else if (c === 0x5d /* ] */) {
      depth--
      i++
      if (depth === 0) operands.push(null)
    } else if (c === 0x2f /* / */) {
      const at = i
      i++
      while (i < n && !WHITE.has(src[i]) && !DELIM.has(src[i])) i++
      operand(null, at)
    } else {
      const at = i
      while (i < n && !WHITE.has(src[i]) && !DELIM.has(src[i])) i++
      if (i === at) {
        i++ // délimiteur inattendu ({, }, >) : on l'ignore
        continue
      }
      const word = String.fromCharCode(...src.subarray(at, i))
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
        operand(Number(word), at)
      } else if (word === 'true' || word === 'false' || word === 'null') {
        operand(null, at)
      } else if (depth === 0) {
        if (word === 'BI') {
          // Image en ligne : données binaires jusqu'à « EI » isolé
          let j = i
          while (j < n && !(src[j] === 0x49 && src[j + 1] === 0x44 && WHITE.has(src[j + 2] ?? 0x20))) j++
          j += 3
          while (j < n && !(WHITE.has(src[j - 1]) && src[j] === 0x45 && src[j + 1] === 0x49 && (j + 2 >= n || WHITE.has(src[j + 2])))) j++
          i = Math.min(n, j + 2)
          ops.push({ name: 'BI', operands: [], start: at, end: i })
        } else {
          ops.push({ name: word, operands, start: start < 0 ? at : start, end: i })
        }
        operands = []
        start = -1
      }
    }
  }
  return ops
}

// ---------- Analyse des positions de texte ----------

const SHOW = new Set(['Tj', 'TJ', "'", '"'])

interface Run {
  ops: number[] // indices des opérateurs d'affichage, enchaînés sans repositionnement
  x: number
  y: number
  horizontal: boolean
}

function textRuns(ops: Op[]): Run[] {
  const runs: Run[] = []
  const stack: Matrix[] = []
  let ctm = IDENTITY
  let tm = IDENTITY
  let tlm = IDENTITY
  let leading = 0
  let rise = 0
  let run: Run | null = null

  const nextLine = (tx: number, ty: number) => {
    tlm = mul([1, 0, 0, 1, tx, ty], tlm)
    tm = tlm
    run = null
  }

  ops.forEach((op, index) => {
    const v = op.operands.map((x) => x ?? 0)
    switch (op.name) {
      case 'q':
        stack.push(ctm)
        break
      case 'Q':
        ctm = stack.pop() ?? IDENTITY
        run = null
        break
      case 'cm':
        if (v.length >= 6) ctm = mul(v.slice(-6), ctm)
        run = null
        break
      case 'BT':
        tm = tlm = IDENTITY
        run = null
        break
      case 'ET':
        run = null
        break
      case 'Tm':
        if (v.length >= 6) tm = tlm = v.slice(-6)
        run = null
        break
      case 'Td':
        nextLine(v[v.length - 2] ?? 0, v[v.length - 1] ?? 0)
        break
      case 'TD':
        leading = -(v[v.length - 1] ?? 0)
        nextLine(v[v.length - 2] ?? 0, v[v.length - 1] ?? 0)
        break
      case 'TL':
        leading = v[v.length - 1] ?? 0
        break
      case 'Ts':
        rise = v[v.length - 1] ?? 0
        run = null
        break
      case 'T*':
        nextLine(0, -leading)
        break
      default:
        if (!SHOW.has(op.name)) {
          // Tout autre opérateur au milieu d'une ligne (Tf, Tc…) peut changer l'avance : on garde le fil
          break
        }
        if (op.name === "'" || op.name === '"') nextLine(0, -leading)
        if (!run) {
          const m = mul(tm, ctm)
          run = { ops: [], x: m[4] + rise * m[2], y: m[5] + rise * m[3], horizontal: m[0] > 0 && Math.abs(m[1]) < 1e-3 * m[0] && Math.abs(m[2]) < 1e-3 * m[3] && m[3] > 0 }
          runs.push(run)
        }
        run.ops.push(index)
    }
  })
  return runs
}

// ---------- Point d'entrée ----------

interface Span {
  x0: number
  x1: number
  y: number
  size: number
}

async function textSpans(page: PDFPageProxy): Promise<Span[]> {
  const content = await page.getTextContent()
  const spans: Span[] = []
  for (const item of content.items) {
    if (!('str' in item) || !item.str) continue
    const [a, b, , d, e, f] = item.transform
    if (a <= 0 || Math.abs(b) > a * 1e-3) continue
    spans.push({ x0: e, x1: e + item.width, y: f, size: Math.abs(d) || a })
  }
  return spans
}

// Étendue réelle d'un texte qui commence en (x, y) : tous les fragments pdf.js de la ligne situés
// avant le début du texte suivant. Les fragments d'autre provenance ne font qu'élargir l'étendue,
// ce qui revient à garder le texte : l'erreur va toujours dans le sens prudent.
function extentOf(line: Span[], x: number, next: number): { x0: number; x1: number } | null {
  let found = false
  let x1 = -Infinity
  for (const s of line) {
    if (s.x0 < x - 1 || s.x0 >= next - 0.5) continue
    if (Math.abs(s.x0 - x) < 1) found = true
    x1 = Math.max(x1, s.x1)
  }
  return found ? { x0: x, x1 } : null
}

const inside = (box: Box, x0: number, x1: number, y: number) =>
  x0 >= box.x0 - 1 && x1 <= box.x1 + 1 && y >= box.y0 - 0.5 && y <= box.y1 + 0.5

async function readContents(doc: PDFDocument, page: PDFPage): Promise<Uint8Array | null> {
  const contents = page.node.Contents()
  if (!contents) return null
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents]
  const parts: Uint8Array[] = []
  for (const s of streams) {
    if (s instanceof PDFRawStream) parts.push(decodePDFRawStream(s).decode())
    else if (s instanceof PDFStream) parts.push(s.getContents())
    else return null
  }
  const total = parts.reduce((t, p) => t + p.length + 1, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    out[at + p.length] = 0x0a
    at += p.length + 1
  }
  return out
}

// boxes : zones recouvertes, en coordonnées PDF de la page
export async function removeCoveredText(doc: PDFDocument, page: PDFPage, source: PDFPageProxy, boxes: Box[]): Promise<number> {
  if (!boxes.length) return 0
  let src: Uint8Array | null
  try {
    src = await readContents(doc, page)
  } catch {
    return 0 // filtre non pris en charge : on se contente du cache
  }
  if (!src) return 0

  const ops = parseOps(src)
  const spans = await textSpans(source)
  const drop = new Map<number, string>() // indice → remplacement

  const runs = textRuns(ops).filter((r) => r.horizontal)
  const near = (y: number) => (s: { y: number }) => Math.abs(s.y - y) < 0.5
  for (const run of runs) {
    if (!boxes.some((b) => inside(b, run.x, run.x, run.y))) continue
    const next = Math.min(Infinity, ...runs.filter(near(run.y)).map((r) => r.x).filter((x) => x > run.x + 0.5))
    const extent = extentOf(spans.filter(near(run.y)), run.x, next)
    if (!extent || !boxes.some((b) => inside(b, extent.x0, extent.x1, run.y))) continue
    for (const index of run.ops) {
      const op = ops[index]
      // ' et " passent aussi à la ligne suivante : on conserve ce déplacement
      if (op.name === "'") drop.set(index, 'T*')
      else if (op.name === '"') {
        const [aw, ac] = op.operands
        drop.set(index, `${aw ?? 0} Tw ${ac ?? 0} Tc T*`)
      } else drop.set(index, '')
    }
  }
  if (!drop.size) return 0

  const chunks: Uint8Array[] = []
  let last = 0
  const encoder = new TextEncoder()
  ;[...drop.keys()]
    .sort((a, b) => a - b)
    .forEach((index) => {
      const op = ops[index]
      chunks.push(src!.subarray(last, op.start), encoder.encode(` ${drop.get(index)} `))
      last = op.end
    })
  chunks.push(src.subarray(last))
  const size = chunks.reduce((t, c) => t + c.length, 0)
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(out)))
  return drop.size
}
