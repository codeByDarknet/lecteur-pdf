import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  ArrowUpRight,
  Bold,
  Circle,
  Eraser,
  Highlighter,
  ImagePlus,
  Italic,
  Loader2,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Save,
  SaveAll,
  Sparkles,
  Square,
  Strikethrough,
  TextCursorInput,
  Type,
  Underline,
  Undo2,
  X,
} from 'lucide-react'
import { Button } from '../ui/button'
import { Separator } from '../ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { cn } from '@/lib/utils'
import { loadFontFamily, systemFontLabel } from '@/lib/systemFonts'
import { useEditStore } from '@/store/useEditStore'
import type { EditObject, EditStyle, EditTool, TextObject } from '@/types/edit'
import { FontPicker, useFontFamilies, type FontChoice } from './FontPicker'

const ANNOTATE_TOOLS: Array<{ tool: EditTool; icon: React.ElementType; label: string }> = [
  { tool: 'select', icon: MousePointer2, label: 'Sélectionner et déplacer' },
  { tool: 'highlight', icon: Highlighter, label: 'Surligner (sélectionnez du texte)' },
  { tool: 'underline', icon: Underline, label: 'Souligner' },
  { tool: 'strike', icon: Strikethrough, label: 'Barrer' },
  { tool: 'text', icon: Type, label: 'Ajouter du texte' },
  { tool: 'ink', icon: Pencil, label: 'Dessin à main levée' },
  { tool: 'rect', icon: Square, label: 'Rectangle' },
  { tool: 'ellipse', icon: Circle, label: 'Ellipse' },
  { tool: 'arrow', icon: ArrowUpRight, label: 'Flèche' },
  { tool: 'line', icon: Minus, label: 'Ligne' },
  { tool: 'image', icon: ImagePlus, label: 'Insérer une image (clic sur la page)' },
]

const ULTRA_TOOLS: Array<{ tool: EditTool; icon: React.ElementType; label: string }> = [
  { tool: 'edit-text', icon: TextCursorInput, label: 'Modifier le texte du PDF (cliquez une ligne)' },
  { tool: 'select', icon: MousePointer2, label: 'Sélectionner, déplacer, redimensionner' },
  { tool: 'text', icon: Type, label: 'Ajouter du texte' },
  { tool: 'image', icon: ImagePlus, label: 'Insérer une image (clic sur la page)' },
  { tool: 'whiteout', icon: Eraser, label: 'Effacer une zone (texte, image, tampon…)' },
]

const COLORS = ['#111827', '#e11d48', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ffffff']
const MARK_COLORS = ['#facc15', '#4ade80', '#60a5fa', '#f472b6', '#fb923c']
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64]

interface EditToolbarProps {
  tabId: string
  saving: boolean
  canSaveInPlace: boolean
  onSave: (asCopy: boolean) => void
  onClose: () => void
}

export function EditToolbar({ tabId, saving, canSaveInPlace, onSave, onClose }: EditToolbarProps) {
  const { mode, tool, style, setMode, setTool, setStyle, undo, redo, update } = useEditStore(
    useShallow((s) => ({
      mode: s.modes[tabId],
      tool: s.tool,
      style: s.style,
      setMode: s.setMode,
      setTool: s.setTool,
      setStyle: s.setStyle,
      undo: s.undo,
      redo: s.redo,
      update: s.update,
    }))
  )
  const canUndo = useEditStore((s) => (s.edits[tabId]?.past.length ?? 0) > 0)
  const canRedo = useEditStore((s) => (s.edits[tabId]?.future.length ?? 0) > 0)
  const dirty = useEditStore((s) => (s.edits[tabId]?.objects.length ?? 0) > 0)
  const selected = useEditStore((s): EditObject | undefined =>
    s.selection?.tabId === tabId ? s.edits[tabId]?.objects.find((o) => o.id === s.selection!.id) : undefined
  )
  const families = useFontFamilies()
  if (!mode) return null

  const tools = mode === 'ultra' ? ULTRA_TOOLS : ANNOTATE_TOOLS
  const selectedText = selected?.type === 'text' ? (selected as TextObject) : undefined
  const isMarkTool = tool === 'highlight'
  const showText = tool === 'text' || tool === 'edit-text' || !!selectedText
  const showStroke = ['ink', 'rect', 'ellipse', 'arrow', 'line'].includes(tool) || selected?.type === 'shape' || selected?.type === 'ink'
  const showColor = tool !== 'image' && tool !== 'whiteout' && tool !== 'edit-text' || !!selectedText

  // Les réglages s'appliquent à l'objet sélectionné, et deviennent la valeur par défaut des suivants
  const applyStyle = (patch: Partial<EditStyle>) => {
    setStyle(patch)
    if (!selected) return
    const objectPatch: Record<string, unknown> = {}
    if (patch.color && (selected.type === 'text' || selected.type === 'shape' || selected.type === 'ink')) objectPatch.color = patch.color
    if (patch.markColor && selected.type === 'markup') objectPatch.color = patch.markColor
    if (patch.color && selected.type === 'markup' && selected.kind !== 'highlight') objectPatch.color = patch.color
    if (patch.strokeWidth && (selected.type === 'shape' || selected.type === 'ink')) objectPatch.width = patch.strokeWidth
    if (selected.type === 'text') {
      if (patch.fontSize) objectPatch.fontSize = patch.fontSize
      if (patch.bold !== undefined) objectPatch.bold = patch.bold
      if (patch.italic !== undefined) objectPatch.italic = patch.italic
      if (patch.font) objectPatch.font = patch.font
      if ('systemFont' in patch) objectPatch.systemFont = patch.systemFont
      // Autre police ou autre style : l'étirement calculé pour la police d'origine ne vaut plus
      if (patch.font || 'systemFont' in patch || patch.bold !== undefined || patch.italic !== undefined) objectPatch.scaleX = 1
    }
    if (Object.keys(objectPatch).length) update(tabId, selected.id, objectPatch)
  }

  // Police installée : on charge la variante (grasse, italique) la plus proche du style voulu
  const applyFamily = async (family: string, bold: boolean, italic: boolean) => {
    const found = await loadFontFamily(family, bold, italic)
    if (found) applyStyle({ systemFont: found.id, bold, italic })
  }

  const chooseFont = (choice: FontChoice) => {
    if (choice.kind === 'standard') applyStyle({ font: choice.font, systemFont: undefined })
    else void applyFamily(choice.family, current.bold, current.italic)
  }

  const toggleStyle = (patch: { bold?: boolean; italic?: boolean }) => {
    const bold = patch.bold ?? current.bold
    const italic = patch.italic ?? current.italic
    if (currentFamily) void applyFamily(currentFamily, bold, italic)
    else applyStyle(patch)
  }

  const current = {
    color: selectedText?.color ?? (selected && 'color' in selected && selected.type !== 'cover' ? selected.color : style.color),
    fontSize: selectedText?.fontSize ?? style.fontSize,
    font: selectedText?.font ?? style.font,
    systemFont: selectedText ? selectedText.systemFont : style.systemFont,
    bold: selectedText?.bold ?? style.bold,
    italic: selectedText?.italic ?? style.italic,
    strokeWidth: selected?.type === 'shape' || selected?.type === 'ink' ? selected.width : style.strokeWidth,
  }
  const currentFamily = current.systemFont ? systemFontLabel(current.systemFont) : undefined
  const familyInfo = families.find((f) => f.family === currentFamily)
  const palette = isMarkTool || selected?.type === 'markup' && selected.kind === 'highlight' ? MARK_COLORS : COLORS
  const activeColor = isMarkTool || selected?.type === 'markup' && selected.kind === 'highlight'
    ? (selected?.type === 'markup' ? selected.color : style.markColor)
    : current.color

  const iconButton = (key: string, icon: React.ElementType, label: string, active: boolean, onClick: () => void, disabled = false) => {
    const Icon = icon
    return (
      <Tooltip key={key}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={label}
            onClick={onClick}
            className={cn('h-7 w-7 text-muted-foreground', active && 'bg-blue-500/15 text-blue-500 hover:bg-blue-500/20 hover:text-blue-500')}
          >
            <Icon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      data-edit-ui=""
      // Garder le focus dans le texte en cours de saisie quand on clique un bouton
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest('select, input:not([type=color])')) e.preventDefault()
      }}
      className="flex items-center gap-0.5 min-h-10 px-2 py-1 flex-wrap bg-toolbar border-b border-border"
    >
      <div className="flex items-center rounded-md bg-background/60 p-0.5 border border-border mr-1">
        <button
          onClick={() => setMode(tabId, 'annotate')}
          className={cn('px-2.5 h-6 rounded text-xs font-medium transition-colors', mode === 'annotate' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          Annoter
        </button>
        <button
          onClick={() => setMode(tabId, 'ultra')}
          className={cn(
            'px-2.5 h-6 rounded text-xs font-medium flex items-center gap-1 transition-colors',
            mode === 'ultra' ? 'bg-gradient-to-r from-fuchsia-500 to-orange-400 text-white shadow' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Sparkles className="h-3 w-3" />
          Édition ultra
        </button>
      </div>

      {tools.map((t) => iconButton(t.tool, t.icon, t.label, tool === t.tool, () => setTool(t.tool)))}

      {(showColor || showText || showStroke) && <Separator orientation="vertical" className="h-5 mx-1" />}

      {showColor && (
        <div className="flex items-center gap-1 px-1">
          {palette.map((c) => (
            <button
              key={c}
              title={c}
              onClick={() => applyStyle(palette === MARK_COLORS ? { markColor: c } : { color: c })}
              className={cn('h-4 w-4 rounded-full border border-black/20 transition-transform hover:scale-110', activeColor === c && 'ring-2 ring-blue-500 ring-offset-1 ring-offset-background')}
              style={{ background: c }}
            />
          ))}
          <label className="relative h-4 w-4 rounded-full border border-dashed border-muted-foreground cursor-pointer overflow-hidden" title="Autre couleur">
            <input
              type="color"
              value={activeColor}
              onChange={(e) => applyStyle(palette === MARK_COLORS ? { markColor: e.target.value } : { color: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
      )}

      {showText && (
        <div className="flex items-center gap-1 px-1">
          <FontPicker family={currentFamily} font={current.font} onChange={chooseFont} />
          <select
            value={SIZES.includes(Math.round(current.fontSize)) ? Math.round(current.fontSize) : ''}
            onChange={(e) => applyStyle({ fontSize: Number(e.target.value) })}
            className="h-6 w-14 rounded border border-border bg-background px-1 text-xs"
          >
            {!SIZES.includes(Math.round(current.fontSize)) && <option value="">{current.fontSize.toFixed(1)}</option>}
            {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {iconButton('bold', Bold, familyInfo && !familyInfo.bold ? 'Pas de variante grasse pour cette police' : 'Gras', current.bold, () => toggleStyle({ bold: !current.bold }), !!familyInfo && !familyInfo.bold && !current.bold)}
          {iconButton('italic', Italic, familyInfo && !familyInfo.italic ? 'Pas de variante italique pour cette police' : 'Italique', current.italic, () => toggleStyle({ italic: !current.italic }), !!familyInfo && !familyInfo.italic && !current.italic)}
        </div>
      )}

      {showStroke && (
        <div className="flex items-center gap-1 px-1">
          {[1, 2, 4, 8].map((w) => (
            <button
              key={w}
              title={`Épaisseur ${w}`}
              onClick={() => applyStyle({ strokeWidth: w })}
              className={cn('h-6 w-6 rounded flex items-center justify-center hover:bg-accent', current.strokeWidth === w && 'bg-accent')}
            >
              <span className="rounded-full bg-foreground" style={{ width: 14, height: Math.min(8, w) }} />
            </button>
          ))}
        </div>
      )}

      <div className="flex-1" />

      {iconButton('undo', Undo2, 'Annuler (Ctrl+Z)', false, () => undo(tabId), !canUndo)}
      {iconButton('redo', Redo2, 'Rétablir (Ctrl+Y)', false, () => redo(tabId), !canRedo)}

      <Separator orientation="vertical" className="h-5 mx-1" />

      {canSaveInPlace && (
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={() => onSave(false)}
          className="h-7 gap-1.5 bg-blue-600 px-3 text-xs text-white hover:bg-blue-500"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Enregistrer
        </Button>
      )}
      {iconButton('saveas', SaveAll, 'Enregistrer sous… (Ctrl+Maj+S)', false, () => onSave(true), !dirty || saving)}
      {iconButton('close', X, 'Quitter l’édition', false, onClose)}
    </div>
  )
}
