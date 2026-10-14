import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { PDFPageProxy } from 'pdfjs-dist'
import { useEditStore } from '@/store/useEditStore'
import { generateId } from '@/lib/utils'
import {
  HIGHLIGHT_OPACITY,
  LINE_HEIGHT,
  arrowHead,
  baselineRatio,
  cssFont,
  extractSourceLines,
  mapObject,
  objectBox,
  sampleColors,
  type SourceLine,
} from '@/lib/pdfEditing'
import { fitImage, loadImageFile, pickImageFile } from '@/lib/editImages'
import type { EditObject, MarkupObject, Rect, ShapeObject, TextObject } from '@/types/edit'

// Dimensions des pages (unités de page) : sert à placer une image collée sur la page courante
export const pageSizes = new Map<string, { w: number; h: number }>()

const EMPTY: EditObject[] = []
const DRAW_TOOLS = new Set(['ink', 'rect', 'ellipse', 'line', 'arrow', 'whiteout'])
const MARK_TOOLS = new Set(['highlight', 'underline', 'strike'])

type Point = { x: number; y: number }
type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'p1' | 'p2'

type Draft =
  | { kind: 'ink'; points: Array<[number, number]> }
  | { kind: 'box'; tool: string; a: Point; b: Point }

// Texte en cours de saisie : nouveau bloc, bloc existant, ou ligne d'origine du PDF
type TextSession =
  | { kind: 'new'; x: number; y: number }
  | { kind: 'object'; id: string }
  | { kind: 'line'; line: SourceLine; bg: string; fg: string; y: number }

interface Props {
  tabId: string
  pageNum: number
  page: PDFPageProxy
  scale: number
}

export const PageEditLayer = React.memo(function PageEditLayer({ tabId, pageNum, page, scale }: Props) {
  const objects = useEditStore(
    useShallow((s) => {
      const all = s.edits[tabId]?.objects
      return all ? all.filter((o) => o.page === pageNum) : EMPTY
    })
  )
  const mode = useEditStore((s) => s.modes[tabId])
  const tool = useEditStore((s) => s.tool)
  const style = useEditStore((s) => s.style)
  const selectedId = useEditStore((s) => (s.selection?.tabId === tabId ? s.selection.id : null))
  const editingId = useEditStore((s) => s.editingId)

  const rootRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [session, setSession] = useState<TextSession | null>(null)
  // Clé de l'éditeur : chaque nouvelle saisie remonte un éditeur neuf
  const [sessionKey, setSessionKey] = useState(0)
  const [lines, setLines] = useState<SourceLine[] | null>(null)

  const vp = useMemo(() => page.getViewport({ scale: 1 }), [page])
  const W = vp.width
  const H = vp.height
  useEffect(() => {
    pageSizes.set(`${tabId}:${pageNum}`, { w: W, h: H })
  }, [tabId, pageNum, W, H])

  const store = useEditStore.getState
  const canvas = () => rootRef.current?.parentElement?.querySelector('canvas') ?? null

  // Document rechargé après enregistrement : relire ses lignes
  useEffect(() => setLines(null), [page])

  // Lignes de texte d'origine, chargées seulement en mode édition ultra
  useEffect(() => {
    if (mode !== 'ultra' || lines) return
    let alive = true
    extractSourceLines(page)
      .then((l) => alive && setLines(l))
      .catch((err) => console.error('Text extraction failed:', err))
    return () => {
      alive = false
    }
  }, [mode, page, lines])

  // Changer d'outil ou de mode valide le texte en cours de saisie
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null
    if (active && rootRef.current?.contains(active)) active.blur()
  }, [tool, mode])

  // Un objet sélectionné depuis ailleurs (ex. double-clic) passe en saisie
  useEffect(() => {
    if (editingId && objects.some((o) => o.id === editingId && o.type === 'text')) {
      openSession({ kind: 'object', id: editingId })
    }
  }, [editingId, objects])

  const toPage = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const r = rootRef.current!.getBoundingClientRect()
      return {
        x: Math.min(W, Math.max(0, (e.clientX - r.left) / scale)),
        y: Math.min(H, Math.max(0, (e.clientY - r.top) / scale)),
      }
    },
    [scale, W, H]
  )

  const selectable = !!mode && (tool === 'select' || tool === 'edit-text')
  const creating = !!mode && (DRAW_TOOLS.has(tool) || tool === 'text' || tool === 'image')

  // ---------- Surlignage / soulignement / barré depuis la sélection de texte ----------
  useEffect(() => {
    if (!mode || !MARK_TOOLS.has(tool)) return
    const onUp = () => {
      setTimeout(() => {
        const sel = window.getSelection()
        const pageEl = rootRef.current?.parentElement
        if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !pageEl) return
        const range = sel.getRangeAt(0)
        if (!range.intersectsNode(pageEl)) return
        const pr = pageEl.getBoundingClientRect()
        const raw = Array.from(range.getClientRects())
          .filter((r) => r.width > 1 && r.height > 1 && r.bottom > pr.top && r.top < pr.bottom && r.right > pr.left && r.left < pr.right)
          .map((r) => ({ x: (r.left - pr.left) / scale, y: (r.top - pr.top) / scale, w: r.width / scale, h: r.height / scale }))
        if (raw.length === 0) return
        const heights = raw.map((r) => r.h).sort((a, b) => a - b)
        const median = heights[Math.floor(heights.length / 2)]
        const merged: Rect[] = []
        for (const r of raw.filter((r) => r.h <= median * 2.5).sort((a, b) => a.y - b.y || a.x - b.x)) {
          const m = merged.find(
            (m) =>
              Math.min(m.y + m.h, r.y + r.h) - Math.max(m.y, r.y) > Math.min(m.h, r.h) * 0.5 &&
              r.x <= m.x + m.w + 2 &&
              r.x + r.w >= m.x - 2
          )
          if (m) {
            const x = Math.min(m.x, r.x)
            const y = Math.min(m.y, r.y)
            m.w = Math.max(m.x + m.w, r.x + r.w) - x
            m.h = Math.max(m.y + m.h, r.y + r.h) - y
            m.x = x
            m.y = y
          } else merged.push({ ...r })
        }
        const s = store()
        s.add(tabId, {
          id: generateId(),
          page: pageNum,
          type: 'markup',
          kind: tool as MarkupObject['kind'],
          rects: merged,
          color: tool === 'highlight' ? s.style.markColor : s.style.color,
        })
        setTimeout(() => window.getSelection()?.removeAllRanges(), 30)
      }, 0)
    }
    document.addEventListener('pointerup', onUp)
    return () => document.removeEventListener('pointerup', onUp)
  }, [mode, tool, scale, tabId, pageNum, store])

  // ---------- Désélection au clic hors des objets ----------
  useEffect(() => {
    if (!selectedId) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (t.closest?.('[data-edit-hit],[data-edit-ui]')) return
      store().select(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [selectedId, store])

  // ---------- Glisser : déplacement, redimensionnement ----------
  const dragWith = (start: Point, onMove: (p: Point) => void, onEnd?: () => void) => {
    const move = (e: PointerEvent) => onMove(toPage(e))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onEnd?.()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    void start
  }

  const startMove = (e: React.PointerEvent, o: EditObject) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const s = store()
    s.select({ tabId, id: o.id })
    const start = toPage(e)
    const box = objectBox(o)
    let moved = false
    dragWith(start, (p) => {
      const dx = p.x - start.x
      const dy = p.y - start.y
      if (!moved) {
        if (Math.abs(dx) + Math.abs(dy) < 1.5 / scale) return
        moved = true
        s.checkpoint(tabId)
      }
      s.update(tabId, o.id, mapObject(o, box, { ...box, x: box.x + dx, y: box.y + dy }), false)
    })
  }

  const startResize = (e: React.PointerEvent, o: EditObject, handle: Handle) => {
    e.stopPropagation()
    e.preventDefault()
    const s = store()
    s.checkpoint(tabId)
    const box = objectBox(o)
    const keepRatio = o.type === 'image' || o.type === 'text'
    dragWith(toPage(e), (p) => {
      if (o.type === 'shape' && (handle === 'p1' || handle === 'p2')) {
        s.update(tabId, o.id, handle === 'p1' ? { x1: p.x, y1: p.y } : { x2: p.x, y2: p.y }, false)
        return
      }
      const left = handle === 'nw' || handle === 'sw'
      const top = handle === 'nw' || handle === 'ne'
      const ax = left ? box.x + box.w : box.x
      const ay = top ? box.y + box.h : box.y
      let w = Math.max(4, left ? ax - p.x : p.x - ax)
      let h = Math.max(4, top ? ay - p.y : p.y - ay)
      if (keepRatio && box.w && box.h) {
        const k = Math.max(w / box.w, h / box.h)
        w = box.w * k
        h = box.h * k
      }
      const to = { x: left ? ax - w : ax, y: top ? ay - h : ay, w, h }
      s.update(tabId, o.id, mapObject(o, box, to), false)
    })
  }

  // ---------- Création ----------
  const onRootPointerDown = async (e: React.PointerEvent) => {
    if (!mode || e.button !== 0 || e.target !== e.currentTarget && !(e.target as Element).closest('svg[data-edit-bg]')) return
    const p = toPage(e)
    const s = store()
    if (tool === 'text') {
      e.preventDefault()
      if (session) return
      openSession({ kind: 'new', x: p.x, y: Math.max(0, p.y - s.style.fontSize * 0.6) })
      return
    }
    if (tool === 'image') {
      e.preventDefault()
      const file = await pickImageFile()
      if (!file) return
      try {
        const img = await loadImageFile(file)
        const { w, h } = fitImage(img.width, img.height, W)
        const id = generateId()
        s.add(tabId, { id, page: pageNum, type: 'image', x: Math.min(p.x, W - w), y: Math.min(p.y, H - h), w, h, src: img.src })
        s.setTool('select')
        s.select({ tabId, id })
      } catch (err) {
        console.error('Image load failed:', err)
      }
      return
    }
    if (!DRAW_TOOLS.has(tool)) return
    e.preventDefault()
    let current: Draft = tool === 'ink' ? { kind: 'ink', points: [[p.x, p.y]] } : { kind: 'box', tool, a: p, b: p }
    setDraft(current)
    dragWith(
      p,
      (q) => {
        current =
          current.kind === 'ink'
            ? { kind: 'ink', points: [...current.points, [q.x, q.y]] }
            : { ...current, b: q }
        setDraft(current)
      },
      () => {
        setDraft(null)
        commitDraft(current)
      }
    )
  }

  const commitDraft = (d: Draft) => {
    const s = store()
    const id = generateId()
    if (d.kind === 'ink') {
      if (d.points.length < 2) return
      s.add(tabId, { id, page: pageNum, type: 'ink', points: d.points, color: s.style.color, width: s.style.strokeWidth })
      return
    }
    const { a, b } = d
    if (Math.abs(b.x - a.x) + Math.abs(b.y - a.y) < 3) return
    if (d.tool === 'whiteout') {
      const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
      // La couleur de la bordure de la zone donne le fond à reproduire
      const { bg } = sampleColors(canvas(), scale, r)
      s.add(tabId, { id, page: pageNum, type: 'cover', ...r, color: bg })
      return
    }
    s.add(tabId, {
      id,
      page: pageNum,
      type: 'shape',
      kind: d.tool as ShapeObject['kind'],
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      color: s.style.color,
      width: s.style.strokeWidth,
    })
  }

  // ---------- Texte ----------
  // Ouvre une saisie en validant d'abord celle en cours
  const openSession = (next: TextSession) => {
    const active = document.activeElement as HTMLElement | null
    if (active && rootRef.current?.contains(active)) active.blur()
    setSession(next)
    setSessionKey((k) => k + 1)
  }

  const editLine = (line: SourceLine) => {
    const box = { x: line.x, y: line.top, w: line.right - line.x, h: line.bottom - line.top }
    const { bg, fg } = sampleColors(canvas(), scale, box)
    const y = line.baseline - baselineRatio(line) * line.size
    openSession({ kind: 'line', line, bg, fg, y })
  }

  const finishSession = (text: string | null) => {
    const current = session
    setSession(null)
    const s = store()
    s.setEditing(null)
    if (!current || text === null) return
    const clean = text.replace(/\n+$/, '')
    if (current.kind === 'new') {
      if (!clean.trim()) return
      const id = generateId()
      const { fontSize, font, bold, italic, color } = s.style
      s.add(tabId, { id, page: pageNum, type: 'text', x: current.x, y: current.y, text: clean, fontSize, font, bold, italic, color })
      s.select({ tabId, id })
    } else if (current.kind === 'object') {
      const o = s.edits[tabId]?.objects.find((x) => x.id === current.id) as TextObject | undefined
      if (!o || o.text === clean) return
      if (clean.trim()) s.update(tabId, o.id, { text: clean })
      else s.remove(tabId, [o.id])
    } else {
      const { line, bg, fg, y } = current
      if (clean === line.text) return
      const coverId = generateId()
      const objs: EditObject[] = [
        {
          id: coverId,
          page: pageNum,
          type: 'cover',
          x: line.x - 1,
          y: line.top - 1,
          w: line.right - line.x + 2,
          h: line.bottom - line.top + 2,
          color: bg,
          sourceKey: line.key,
        },
      ]
      const textId = generateId()
      if (clean.trim()) {
        objs.push({
          id: textId,
          page: pageNum,
          type: 'text',
          x: line.x,
          y,
          text: clean,
          fontSize: line.size,
          font: line.font,
          bold: line.bold,
          italic: line.italic,
          color: fg,
          coverId,
        })
      }
      s.add(tabId, objs)
      if (clean.trim()) s.select({ tabId, id: textId })
    }
  }

  const hiddenLines = useMemo(
    () => new Set(objects.flatMap((o) => (o.type === 'cover' && o.sourceKey ? [o.sourceKey] : []))),
    [objects]
  )

  if (!mode && objects.length === 0) return null

  const px = (v: number) => v * scale
  const hitProps = (o: EditObject) =>
    selectable
      ? {
          'data-edit-hit': '',
          onPointerDown: (e: React.PointerEvent) => startMove(e, o),
          style: { cursor: 'move', pointerEvents: 'all' as const },
        }
      : { style: { pointerEvents: 'none' as const } }

  const covers = objects.filter((o) => o.type === 'cover')
  const images = objects.filter((o) => o.type === 'image')
  const vectors = objects.filter((o) => o.type === 'shape' || o.type === 'ink')
  const marks = objects.filter((o) => o.type === 'markup')
  const texts = objects.filter((o): o is TextObject => o.type === 'text')
  const selected = objects.find((o) => o.id === selectedId)
  const editingObjectId = session?.kind === 'object' ? session.id : null

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      style={{
        zIndex: 10,
        pointerEvents: creating ? 'auto' : 'none',
        cursor: tool === 'text' ? 'text' : creating ? 'crosshair' : undefined,
      }}
      onPointerDown={onRootPointerDown}
    >
      <svg
        data-edit-bg=""
        className="absolute inset-0"
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ pointerEvents: 'none', overflow: 'visible' }}
      >
        {covers.map((o) => o.type === 'cover' && (
          <rect key={o.id} x={o.x} y={o.y} width={o.w} height={o.h} fill={o.color} {...hitProps(o)} />
        ))}
        {images.map((o) => o.type === 'image' && (
          <image key={o.id} href={o.src} x={o.x} y={o.y} width={o.w} height={o.h} preserveAspectRatio="none" {...hitProps(o)} />
        ))}
        {vectors.map((o) => <VectorShape key={o.id} o={o} scale={scale} hit={hitProps(o)} />)}
        {marks.map((o) => o.type === 'markup' && (
          <g key={o.id} {...hitProps(o)}>
            {o.rects.map((r, i) =>
              o.kind === 'highlight' ? (
                <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={o.color} opacity={HIGHLIGHT_OPACITY} style={{ mixBlendMode: 'multiply' }} />
              ) : (
                <g key={i}>
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="transparent" />
                  <line
                    x1={r.x}
                    x2={r.x + r.w}
                    y1={r.y + r.h * (o.kind === 'underline' ? 0.94 : 0.55)}
                    y2={r.y + r.h * (o.kind === 'underline' ? 0.94 : 0.55)}
                    stroke={o.color}
                    strokeWidth={Math.max(0.8, r.h * 0.07)}
                  />
                </g>
              )
            )}
          </g>
        ))}
        {draft && <DraftShape draft={draft} style={style} scale={scale} />}
      </svg>

      {texts.map((o) =>
        o.id === editingObjectId ? null : (
          <div
            key={o.id}
            data-edit-hit=""
            onPointerDown={(e) => {
              if (mode && (tool === 'text' || tool === 'edit-text')) {
                e.stopPropagation()
                e.preventDefault()
                store().select({ tabId, id: o.id })
                openSession({ kind: 'object', id: o.id })
              } else if (selectable) startMove(e, o)
            }}
            onDoubleClick={() => mode && openSession({ kind: 'object', id: o.id })}
            className="absolute whitespace-pre"
            style={{
              left: px(o.x),
              top: px(o.y),
              font: cssFont(o, px(o.fontSize)),
              lineHeight: LINE_HEIGHT,
              color: o.color,
              pointerEvents: mode && (selectable || tool === 'text') ? 'auto' : 'none',
              cursor: tool === 'select' ? 'move' : 'text',
            }}
          >
            {o.text}
          </div>
        )
      )}

      {/* Lignes du PDF d'origine, cliquables en mode édition ultra */}
      {mode === 'ultra' && tool === 'edit-text' && lines?.map((line) =>
        hiddenLines.has(line.key) || (session?.kind === 'line' && session.line.key === line.key) ? null : (
          <div
            key={line.key}
            data-edit-hit=""
            title="Cliquer pour modifier ce texte"
            className="absolute rounded-[2px] hover:outline hover:outline-1 hover:outline-blue-500 hover:bg-blue-500/10"
            style={{
              left: px(line.x) - 2,
              top: px(line.top) - 1,
              width: px(line.right - line.x) + 4,
              height: px(line.bottom - line.top) + 2,
              pointerEvents: 'auto',
              cursor: 'text',
            }}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              editLine(line)
            }}
          />
        )
      )}

      {session && (
        <TextSessionEditor key={sessionKey} session={session} scale={scale} objects={objects} onDone={finishSession} />
      )}

      {selected && !session && (
        <SelectionBox
          o={selected}
          scale={scale}
          onMove={(e) => startMove(e, selected)}
          onResize={(e, h) => startResize(e, selected, h)}
        />
      )}
    </div>
  )
})

function VectorShape({ o, scale, hit }: { o: EditObject; scale: number; hit: Record<string, unknown> }) {
  const hitWidth = Math.max(10 / scale, 0)
  if (o.type === 'ink') {
    const points = o.points.map((p) => p.join(',')).join(' ')
    return (
      <g {...hit}>
        <polyline points={points} fill="none" stroke={o.color} strokeWidth={o.width} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={points} fill="none" stroke="transparent" strokeWidth={Math.max(o.width, hitWidth)} />
      </g>
    )
  }
  if (o.type !== 'shape') return null
  return (
    <g {...hit}>
      <ShapePath kind={o.kind} x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} color={o.color} width={o.width} />
      <ShapePath kind={o.kind} x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} color="transparent" width={Math.max(o.width, hitWidth)} />
    </g>
  )
}

function ShapePath({ kind, x1, y1, x2, y2, color, width, dashed }: Omit<ShapeObject, 'id' | 'page' | 'type' | 'kind'> & { kind: string; dashed?: boolean }) {
  const common = { stroke: color, strokeWidth: width, fill: 'none', strokeLinecap: 'round' as const, strokeDasharray: dashed ? `${width * 3} ${width * 2}` : undefined }
  const x = Math.min(x1, x2)
  const y = Math.min(y1, y2)
  const w = Math.abs(x2 - x1)
  const h = Math.abs(y2 - y1)
  if (kind === 'rect') return <rect x={x} y={y} width={w} height={h} {...common} />
  if (kind === 'ellipse') return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />
  const head = kind === 'arrow' ? arrowHead(x1, y1, x2, y2, width) : []
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} />
      {head.map(([hx, hy], i) => <line key={i} x1={x2} y1={y2} x2={hx} y2={hy} {...common} />)}
    </g>
  )
}

function DraftShape({ draft, style, scale }: { draft: Draft; style: { color: string; strokeWidth: number }; scale: number }) {
  if (draft.kind === 'ink') {
    return (
      <polyline
        points={draft.points.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke={style.color}
        strokeWidth={style.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )
  }
  const { a, b, tool } = draft
  if (tool === 'whiteout') {
    return (
      <rect
        x={Math.min(a.x, b.x)}
        y={Math.min(a.y, b.y)}
        width={Math.abs(b.x - a.x)}
        height={Math.abs(b.y - a.y)}
        fill="rgba(255,255,255,0.85)"
        stroke="#3b82f6"
        strokeWidth={1 / scale}
        strokeDasharray={`${4 / scale} ${3 / scale}`}
      />
    )
  }
  return <ShapePath kind={tool} x1={a.x} y1={a.y} x2={b.x} y2={b.y} color={style.color} width={style.strokeWidth} />
}

function SelectionBox({
  o,
  scale,
  onMove,
  onResize,
}: {
  o: EditObject
  scale: number
  onMove: (e: React.PointerEvent) => void
  onResize: (e: React.PointerEvent, h: Handle) => void
}) {
  const b = objectBox(o)
  const pad = 4
  const handle = (h: Handle, left: number, top: number, cursor: string) => (
    <div
      key={h}
      data-edit-hit=""
      onPointerDown={(e) => onResize(e, h)}
      className="absolute h-2.5 w-2.5 rounded-sm border border-blue-500 bg-white shadow"
      style={{ left: left - 5, top: top - 5, cursor, pointerEvents: 'auto' }}
    />
  )
  if (o.type === 'shape' && (o.kind === 'line' || o.kind === 'arrow')) {
    return (
      <>
        {handle('p1', o.x1 * scale, o.y1 * scale, 'crosshair')}
        {handle('p2', o.x2 * scale, o.y2 * scale, 'crosshair')}
      </>
    )
  }
  const left = b.x * scale - pad
  const top = b.y * scale - pad
  const width = b.w * scale + pad * 2
  const height = b.h * scale + pad * 2
  const resizable = o.type !== 'ink' && o.type !== 'markup'
  return (
    <div className="absolute" style={{ left, top, width, height, pointerEvents: 'none' }}>
      <div
        data-edit-hit=""
        onPointerDown={onMove}
        className="absolute inset-0 rounded-[3px] border border-dashed border-blue-500"
        style={{ pointerEvents: 'none' }}
      />
      {resizable && [
        handle('nw', 0, 0, 'nwse-resize'),
        handle('ne', width, 0, 'nesw-resize'),
        handle('sw', 0, height, 'nesw-resize'),
        handle('se', width, height, 'nwse-resize'),
      ]}
    </div>
  )
}

function TextSessionEditor({
  session,
  scale,
  objects,
  onDone,
}: {
  session: TextSession
  scale: number
  objects: EditObject[]
  onDone: (text: string | null) => void
}) {
  const style = useEditStore((s) => s.style)
  const ref = useRef<HTMLDivElement>(null)
  const cancelled = useRef(false)

  let x: number
  let y: number
  let initial = ''
  let look: Pick<TextObject, 'font' | 'bold' | 'italic' | 'color' | 'fontSize'>
  let cover: { x: number; y: number; w: number; h: number; color: string } | null = null

  if (session.kind === 'new') {
    x = session.x
    y = session.y
    look = style
  } else if (session.kind === 'object') {
    const o = objects.find((x) => x.id === session.id) as TextObject | undefined
    x = o?.x ?? 0
    y = o?.y ?? 0
    initial = o?.text ?? ''
    look = o ?? style
  } else {
    const { line, bg, fg } = session
    x = line.x
    y = session.y
    initial = line.text
    look = { font: line.font, bold: line.bold, italic: line.italic, color: fg, fontSize: line.size }
    cover = { x: line.x - 1, y: line.top - 1, w: line.right - line.x + 2, h: line.bottom - line.top + 2, color: bg }
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.textContent = initial
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (session.kind === 'object' && !objects.some((o) => o.id === session.id)) return null

  return (
    <>
      {cover && (
        <div
          className="absolute"
          style={{ left: cover.x * scale, top: cover.y * scale, width: cover.w * scale, height: cover.h * scale, background: cover.color }}
        />
      )}
      <div
        ref={ref}
        data-edit-hit=""
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        spellCheck={false}
        className="absolute whitespace-pre rounded-[2px] outline outline-2 outline-blue-500/70"
        style={{
          left: x * scale,
          top: y * scale,
          minWidth: look.fontSize * scale,
          font: cssFont(look, look.fontSize * scale),
          lineHeight: LINE_HEIGHT,
          color: look.color,
          pointerEvents: 'auto',
          cursor: 'text',
          caretColor: '#3b82f6',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') {
            cancelled.current = true
            ref.current?.blur()
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            ref.current?.blur()
          }
        }}
        onBlur={() => onDone(cancelled.current ? null : ref.current?.innerText ?? '')}
      />
    </>
  )
}
