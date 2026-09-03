import { create } from 'zustand'
import type { PdfTab, Panel, SplitDirection } from '@/types'
import { generateId } from '@/lib/utils'

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

export const useAppStore = create<AppState>((set, get) => ({
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
                tab.id === tabId ? { ...tab, zoom: Math.max(0.25, Math.min(3, zoom)) } : tab
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
}))
