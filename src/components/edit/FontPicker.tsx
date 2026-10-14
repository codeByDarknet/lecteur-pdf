import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CSS_FONTS, FONT_LABELS } from '@/lib/pdfEditing'
import { listFontFamilies, type FontFamilyInfo } from '@/lib/systemFonts'
import type { FontKey } from '@/types/edit'

export type FontChoice = { kind: 'standard'; font: FontKey } | { kind: 'family'; family: string }

interface FontPickerProps {
  // Police affichée : famille installée, ou à défaut police standard
  family?: string
  font: FontKey
  onChange: (choice: FontChoice) => void
}

export function useFontFamilies() {
  const [families, setFamilies] = useState<FontFamilyInfo[]>([])
  useEffect(() => {
    let alive = true
    listFontFamilies().then((list) => alive && setFamilies(list))
    return () => {
      alive = false
    }
  }, [])
  return families
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function FontPicker({ family, font, onChange }: FontPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [anchor, setAnchor] = useState({ left: 0, top: 0 })
  const families = useFontFamilies()
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Position fixe, pour ne pas être rognée par les conteneurs ; recalculée car la barre se réorganise
  // quand la sélection change (la saisie en cours est validée à l'ouverture de la liste)
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const r = buttonRef.current.getBoundingClientRect()
    const left = Math.max(4, Math.min(r.left, window.innerWidth - 292))
    if (left !== anchor.left || r.bottom + 4 !== anchor.top) setAnchor({ left, top: r.bottom + 4 })
  })

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // À l'ouverture, la police courante est visible dans la liste
  useEffect(() => {
    if (!open) return
    setQuery('')
    requestAnimationFrame(() => listRef.current?.querySelector('[data-current]')?.scrollIntoView({ block: 'center' }))
  }, [open])

  const filtered = useMemo(() => {
    const q = fold(query.trim())
    return q ? families.filter((f) => fold(f.family).includes(q)) : families
  }, [families, query])
  const standards = (Object.keys(FONT_LABELS) as FontKey[]).filter((f) => !query.trim() || fold(FONT_LABELS[f]).includes(fold(query.trim())))

  const pick = (choice: FontChoice) => {
    setOpen(false)
    onChange(choice)
  }

  const item = (key: string, label: string, cssFamily: string, active: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      data-current={active ? '' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[13px] hover:bg-accent [content-visibility:auto] [contain-intrinsic-size:auto_26px]',
        active && 'bg-blue-500/10 text-blue-500'
      )}
    >
      <span className="w-3.5 shrink-0">{active && <Check className="h-3.5 w-3.5" />}</span>
      <span className="truncate" style={{ fontFamily: cssFamily }}>{label}</span>
    </button>
  )

  return (
    <div ref={rootRef}>
      <button
        type="button"
        title="Police"
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        className="flex h-6 w-40 items-center gap-1 rounded border border-border bg-background px-1.5 text-xs"
      >
        <span className="flex-1 truncate text-left" style={{ fontFamily: family ? `"${family}"` : CSS_FONTS[font] }}>
          {family ?? FONT_LABELS[font]}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div style={anchor} className="fixed z-50 flex w-72 flex-col rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-border px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setOpen(false)
                } else if (e.key === 'Enter') {
                  const first = filtered[0]
                  if (first) pick({ kind: 'family', family: first.family })
                  else if (standards[0]) pick({ kind: 'standard', font: standards[0] })
                }
              }}
              placeholder="Rechercher une police…"
              className="h-8 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} className="max-h-80 overflow-y-auto p-1">
            {standards.length > 0 && (
              <>
                <div className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Polices PDF standard</div>
                {standards.map((f) => item(f, FONT_LABELS[f], CSS_FONTS[f], !family && font === f, () => pick({ kind: 'standard', font: f })))}
              </>
            )}
            {filtered.length > 0 && (
              <div className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Polices installées ({filtered.length})
              </div>
            )}
            {filtered.map((f) =>
              item(`fam:${f.family}`, f.family, f.latin ? `"${f.family}", ${CSS_FONTS.helvetica}` : 'inherit', family === f.family, () => pick({ kind: 'family', family: f.family }))
            )}
            {!standards.length && !filtered.length && <div className="px-2 py-3 text-center text-xs text-muted-foreground">Aucune police trouvée</div>}
          </div>
        </div>
      )}
    </div>
  )
}
