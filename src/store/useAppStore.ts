import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PdfTab, Panel, SplitDirection } from '@/types'
import { generateId } from '@/lib/utils'
import { clearPdfCache } from '@/lib/fileCache'

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 3

// Libère le cache (et les blob URLs) des fichiers qui ne sont plus ouverts dans aucun onglet
const releaseClosedFiles = (before: Panel[], after: Panel[]) => {
  const stillOpen = new Set(after.flatMap((p) => p.tabs.map((t) => t.filePath)))
  for (const panel of before) {
    for (const tab of panel.tabs) {
      if (stillOpen.has(tab.filePath)) continue
      clearPdfCache(tab.filePath)
      if (tab.filePath.startsWith('blob:')) URL.revokeObjectURL(tab.filePath)
    }
  }
}

const createDefaultPanel = (): Panel => ({
  id: generateId(),
  tabs: [],
  activeTabId: null,
  showThumbnails: false,
})

interface AppState {
  panels: Panel[]
  activePanelId: string
  splitDirection: SplitDirection

  addPanel: (tabToDuplicate?: PdfTab) => void
  removePanel: (panelId: string) => void
  setActivePanel: (panelId: string) => void
  setSplitDirection: (dir: SplitDirection) => void

  openFile: (panelId: string, filePath: string, fileName: string) => void
  openFiles: (panelId: string, files: Array<{ filePath: string; fileName: string }>) => void
  closeTab: (panelId: string, tabId: string) => void
  setActiveTab: (panelId: string, tabId: string) => void
  moveTab: (fromPanelId: string, toPanelId: string, tabId: string, insertIndex?: number) => void
  reorderTabs: (panelId: string, fromIndex: number, toIndex: number) => void

  setCurrentPage: (panelId: string, tabId: string, page: number) => void
  setTotalPages: (panelId: string, tabId: string, total: number) => void
  setZoom: (panelId: string, tabId: string, zoom: number) => void

  toggleThumbnails: (panelId: string) => void

  theme: 'dark' | 'light'
  toggleTheme: () => void
}

const getInitialTheme = (): 'dark' | 'light' => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
    if (saved) return saved
  }
  return 'dark'
}

const initialPanel = createDefaultPanel()

type PersistedSession = Pick<AppState, 'panels' | 'activePanelId' | 'splitDirection'>

// Les fichiers glissés hors Electron (blob:) ne survivent pas à un redémarrage
const sessionPanels = (panels: Panel[]): Panel[] =>
  panels.map((panel) => {
    const tabs = panel.tabs.filter((t) => !t.filePath.startsWith('blob:'))
    const activeTabId = tabs.some((t) => t.id === panel.activeTabId) ? panel.activeTabId : tabs[0]?.id ?? null
    return { ...panel, tabs, activeTabId }
  })

export const useAppStore = create<AppState>()(persist((set, get) => ({
  theme: getInitialTheme(),
  toggleTheme: () => {
    set((state) => {
      const nextTheme = state.theme === 'dark' ? 'light' : 'dark'
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', nextTheme)
        if (nextTheme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      }
      return { theme: nextTheme }
    })
  },

  panels: [initialPanel],
  activePanelId: initialPanel.id,
  splitDirection: 'horizontal',

  addPanel: (tabToDuplicate) => {
    const newPanel = createDefaultPanel()
    if (tabToDuplicate) {
      const duplicatedTab: PdfTab = {
        ...tabToDuplicate,
        id: generateId(),
        currentPage: tabToDuplicate.currentPage,
        zoom: tabToDuplicate.zoom,
      }
      newPanel.tabs = [duplicatedTab]
      newPanel.activeTabId = duplicatedTab.id
    }
    set((state) => ({
      panels: [...state.panels, newPanel],
    }))
  },

  removePanel: (panelId) => {
    const before = get().panels
    set((state) => {
      const remaining = state.panels.filter((p) => p.id !== panelId)
      if (remaining.length === 0) {
        const newPanel = createDefaultPanel()
        return { panels: [newPanel], activePanelId: newPanel.id }
      }
      return {
        panels: remaining,
        activePanelId: state.activePanelId === panelId ? remaining[0].id : state.activePanelId,
      }
    })
    releaseClosedFiles(before, get().panels)
  },

  setActivePanel: (panelId) => set({ activePanelId: panelId }),

  setSplitDirection: (dir) => set({ splitDirection: dir }),

  openFiles: (panelId, files) => {
    if (!files || files.length === 0) return
    const newTabs: PdfTab[] = files.map((file) => ({
      id: generateId(),
      filePath: file.filePath,
      fileName: file.fileName,
      currentPage: 1,
      totalPages: 0,
      zoom: 1,
    }))
    set((state) => ({
      panels: state.panels.map((panel) =>
        panel.id === panelId
          ? { ...panel, tabs: [...panel.tabs, ...newTabs], activeTabId: newTabs[0].id }
          : panel
      ),
    }))
  },

  openFile: (panelId, filePath, fileName) => {
    get().openFiles(panelId, [{ filePath, fileName }])
  },

  closeTab: (panelId, tabId) => {
    const before = get().panels
    set((state) => ({
      panels: state.panels.map((panel) => {
        if (panel.id !== panelId) return panel
        const newTabs = panel.tabs.filter((t) => t.id !== tabId)
        let newActiveTabId = panel.activeTabId
        if (panel.activeTabId === tabId) {
          const closedIndex = panel.tabs.findIndex((t) => t.id === tabId)
          newActiveTabId = newTabs.length > 0
            ? newTabs[Math.min(closedIndex, newTabs.length - 1)].id
            : null
        }
        return { ...panel, tabs: newTabs, activeTabId: newActiveTabId }
      }),
    }))
    releaseClosedFiles(before, get().panels)
  },

  setActiveTab: (panelId, tabId) => {
    set((state) => ({
      panels: state.panels.map((panel) =>
        panel.id === panelId ? { ...panel, activeTabId: tabId } : panel
      ),
    }))
  },

  moveTab: (fromPanelId, toPanelId, tabId, insertIndex) => {
    set((state) => {
      const fromPanel = state.panels.find((p) => p.id === fromPanelId)
      if (!fromPanel) return state
      const tab = fromPanel.tabs.find((t) => t.id === tabId)
      if (!tab) return state

      return {
        panels: state.panels.map((panel) => {
          if (panel.id === fromPanelId) {
            const newTabs = panel.tabs.filter((t) => t.id !== tabId)
            let newActiveTabId = panel.activeTabId
            if (panel.activeTabId === tabId) {
              newActiveTabId = newTabs.length > 0 ? newTabs[0].id : null
            }
            return { ...panel, tabs: newTabs, activeTabId: newActiveTabId }
          }
          if (panel.id === toPanelId) {
            const newTabs = [...panel.tabs]
            const idx = insertIndex !== undefined ? insertIndex : newTabs.length
            newTabs.splice(idx, 0, tab)
            return { ...panel, tabs: newTabs, activeTabId: tab.id }
          }
          return panel
        }),
      }
    })
  },

  reorderTabs: (panelId, fromIndex, toIndex) => {
    set((state) => ({
      panels: state.panels.map((panel) => {
        if (panel.id !== panelId) return panel
        const newTabs = [...panel.tabs]
        const [moved] = newTabs.splice(fromIndex, 1)
        newTabs.splice(toIndex, 0, moved)
        return { ...panel, tabs: newTabs }
      }),
    }))
  },

  setCurrentPage: (panelId, tabId, page) => {
    set((state) => ({
      panels: state.panels.map((panel) =>
        panel.id === panelId
          ? {
              ...panel,
              tabs: panel.tabs.map((tab) =>
                tab.id === tabId ? { ...tab, currentPage: page } : tab
              ),
            }
          : panel
      ),
    }))
  },

  setTotalPages: (panelId, tabId, total) => {
    set((state) => ({
      panels: state.panels.map((panel) =>
        panel.id === panelId
          ? {
              ...panel,
              tabs: panel.tabs.map((tab) =>
                tab.id === tabId ? { ...tab, totalPages: total } : tab
              ),
            }
          : panel
      ),
    }))
  },

  setZoom: (panelId, tabId, zoom) => {
    set((state) => ({
      panels: state.panels.map((panel) =>
        panel.id === panelId
          ? {
              ...panel,
              tabs: panel.tabs.map((tab) =>
                tab.id === tabId ? { ...tab, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) } : tab
              ),
            }
          : panel
      ),
    }))
  },

  toggleThumbnails: (panelId) => {
    set((state) => ({
      panels: state.panels.map((panel) =>
        panel.id === panelId
          ? { ...panel, showThumbnails: !panel.showThumbnails }
          : panel
      ),
    }))
  },
}), {
  name: 'lecteur-pdf-session',
  version: 1,
  partialize: (state): PersistedSession => ({
    panels: sessionPanels(state.panels),
    activePanelId: state.activePanelId,
    splitDirection: state.splitDirection,
  }),
  merge: (persisted, current) => {
    const session = persisted as Partial<PersistedSession> | undefined
    if (!session || !Array.isArray(session.panels) || session.panels.length === 0) return current
    const panels = sessionPanels(session.panels)
    const activePanelId = panels.some((p) => p.id === session.activePanelId) ? session.activePanelId! : panels[0].id
    return {
      ...current,
      panels,
      activePanelId,
      splitDirection: session.splitDirection ?? current.splitDirection,
    }
  },
}))
