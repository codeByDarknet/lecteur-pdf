import { create } from 'zustand'
import type { EditMode, EditObject, EditStyle, EditTool } from '@/types/edit'

const HISTORY_LIMIT = 100

interface TabEdits {
  objects: EditObject[]
  past: EditObject[][]
  future: EditObject[][]
}

interface Selection {
  tabId: string
  id: string
}

interface EditState {
  edits: Record<string, TabEdits>
  modes: Record<string, EditMode | undefined>
  tool: EditTool
  style: EditStyle
  selection: Selection | null
  editingId: string | null
  // Incrémenté à chaque enregistrement : les onglets du même fichier se rechargent
  fileVersions: Record<string, number>

  setMode: (tabId: string, mode: EditMode | null) => void
  setTool: (tool: EditTool) => void
  setStyle: (style: Partial<EditStyle>) => void
  select: (selection: Selection | null) => void
  setEditing: (id: string | null) => void

  // Enregistre l'état courant dans l'historique (avant un déplacement, par exemple)
  checkpoint: (tabId: string) => void
  add: (tabId: string, objects: EditObject | EditObject[]) => void
  update: (tabId: string, id: string, patch: Partial<EditObject>, record?: boolean) => void
  remove: (tabId: string, ids: string[]) => void
  undo: (tabId: string) => void
  redo: (tabId: string) => void
  clear: (tabId: string) => void
  bumpFileVersion: (filePath: string) => void
}

const emptyEdits = (): TabEdits => ({ objects: [], past: [], future: [] })

const withHistory = (tab: TabEdits, objects: EditObject[]): TabEdits => ({
  objects,
  past: [...tab.past, tab.objects].slice(-HISTORY_LIMIT),
  future: [],
})

export const useEditStore = create<EditState>()((set, get) => {
  const tabOf = (tabId: string) => get().edits[tabId] ?? emptyEdits()
  const setTab = (tabId: string, tab: TabEdits) => set((s) => ({ edits: { ...s.edits, [tabId]: tab } }))

  return {
    edits: {},
    modes: {},
    tool: 'select',
    style: {
      color: '#e11d48',
      markColor: '#facc15',
      strokeWidth: 2,
      fontSize: 14,
      font: 'helvetica',
      bold: false,
      italic: false,
    },
    selection: null,
    editingId: null,
    fileVersions: {},

    setMode: (tabId, mode) =>
      set((s) => ({
        modes: { ...s.modes, [tabId]: mode ?? undefined },
        tool: mode === 'ultra' ? 'edit-text' : mode === 'annotate' ? 'highlight' : 'select',
        selection: null,
        editingId: null,
      })),
    setTool: (tool) => set({ tool, selection: null, editingId: null }),
    setStyle: (style) => set((s) => ({ style: { ...s.style, ...style } })),
    select: (selection) => set({ selection }),
    setEditing: (editingId) => set({ editingId }),

    checkpoint: (tabId) => {
      const tab = tabOf(tabId)
      setTab(tabId, withHistory(tab, tab.objects))
    },
    add: (tabId, objects) => {
      const tab = tabOf(tabId)
      setTab(tabId, withHistory(tab, [...tab.objects, ...(Array.isArray(objects) ? objects : [objects])]))
    },
    update: (tabId, id, patch, record = true) => {
      const tab = tabOf(tabId)
      const objects = tab.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as EditObject) : o))
      setTab(tabId, record ? withHistory(tab, objects) : { ...tab, objects })
    },
    remove: (tabId, ids) => {
      const tab = tabOf(tabId)
      setTab(tabId, withHistory(tab, tab.objects.filter((o) => !ids.includes(o.id))))
      const sel = get().selection
      if (sel && ids.includes(sel.id)) set({ selection: null })
    },
    undo: (tabId) => {
      const tab = tabOf(tabId)
      const previous = tab.past[tab.past.length - 1]
      if (!previous) return
      setTab(tabId, { objects: previous, past: tab.past.slice(0, -1), future: [tab.objects, ...tab.future] })
      set({ selection: null, editingId: null })
    },
    redo: (tabId) => {
      const tab = tabOf(tabId)
      const [next, ...future] = tab.future
      if (!next) return
      setTab(tabId, { objects: next, past: [...tab.past, tab.objects], future })
      set({ selection: null, editingId: null })
    },
    clear: (tabId) =>
      set((s) => {
        const edits = { ...s.edits }
        delete edits[tabId]
        return { edits, selection: null, editingId: null }
      }),
    bumpFileVersion: (filePath) =>
      set((s) => ({ fileVersions: { ...s.fileVersions, [filePath]: (s.fileVersions[filePath] ?? 0) + 1 } })),
  }
})

export const hasUnsavedEdits = (tabId: string) => (useEditStore.getState().edits[tabId]?.objects.length ?? 0) > 0

export const anyUnsavedEdits = () => Object.values(useEditStore.getState().edits).some((t) => t.objects.length > 0)
