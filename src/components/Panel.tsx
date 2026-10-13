import React, { useCallback, useState } from 'react'
import { FileUp } from 'lucide-react'
import { TabBar } from './TabBar'
import { PdfViewer } from './PdfViewer'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store/useAppStore'
import { cn, selectPdfFiles } from '@/lib/utils'
import type { Panel as PanelType } from '@/types'

interface PdfPanelProps {
  panel: PanelType
  isActive: boolean
  showCloseButton: boolean
}

// memo : un panel ne se redessine que si son propre état change
export const PdfPanel = React.memo(function PdfPanel({ panel, isActive, showCloseButton }: PdfPanelProps) {
  const { openFiles, closeTab, setActiveTab, setActivePanel, removePanel, moveTab, reorderTabs } = useAppStore(
    useShallow((s) => ({
      openFiles: s.openFiles,
      closeTab: s.closeTab,
      setActiveTab: s.setActiveTab,
      setActivePanel: s.setActivePanel,
      removePanel: s.removePanel,
      moveTab: s.moveTab,
      reorderTabs: s.reorderTabs,
    }))
  )
  const [isDragTarget, setIsDragTarget] = useState(false)

  const activeTab = panel.tabs.find((t) => t.id === panel.activeTabId) ?? null

  const handleOpenFile = useCallback(async () => {
    try {
      const files = await selectPdfFiles()
      if (files && files.length > 0) {
        openFiles(panel.id, files)
      }
    } catch (err) {
      console.error('Error opening files:', err)
    }
  }, [panel.id, openFiles])

  const handleClosePanel = useCallback(() => {
    removePanel(panel.id)
  }, [panel.id, removePanel])

  const handleReorderTabs = useCallback(
    (fromIndex: number, toIndex: number) => {
      reorderTabs(panel.id, fromIndex, toIndex)
    },
    [panel.id, reorderTabs]
  )

  const handleMoveTab = useCallback(
    (fromPanelId: string, tabId: string, insertIndex?: number) => {
      moveTab(fromPanelId, panel.id, tabId, insertIndex)
    },
    [panel.id, moveTab]
  )

  const handlePanelDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/pdf-tab')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setIsDragTarget(true)
    } else if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragTarget(true)
    }
  }

  const handlePanelDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragTarget(false)
    }
  }

  const handlePanelDrop = (e: React.DragEvent) => {
    setIsDragTarget(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault()
      const droppedFiles: Array<{ filePath: string; fileName: string }> = []
      for (const file of Array.from(e.dataTransfer.files)) {
        if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
          const path = (file as any).path || URL.createObjectURL(file)
          droppedFiles.push({ filePath: path, fileName: file.name })
        }
      }
      if (droppedFiles.length > 0) {
        openFiles(panel.id, droppedFiles)
        return
      }
    }

    try {
      const raw = e.dataTransfer.getData('application/pdf-tab')
      if (!raw) return
      const data = JSON.parse(raw)
      const { tabId, panelId: sourcePanelId } = data
      if (sourcePanelId !== panel.id) {
        e.preventDefault()
        moveTab(sourcePanelId, panel.id, tabId)
      }
    } catch (err) {
      console.error('Panel drop error:', err)
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full w-full min-h-0 flex-1 transition-all',
        isActive && 'ring-1 ring-blue-500/20',
        isDragTarget && 'ring-2 ring-blue-500 ring-inset bg-blue-500/5'
      )}
      onClick={() => setActivePanel(panel.id)}
      onDragOver={handlePanelDragOver}
      onDragLeave={handlePanelDragLeave}
      onDrop={handlePanelDrop}
    >
      <TabBar
        tabs={panel.tabs}
        activeTabId={panel.activeTabId}
        panelId={panel.id}
        showCloseButton={showCloseButton}
        onSelectTab={(tabId) => setActiveTab(panel.id, tabId)}
        onCloseTab={(tabId) => closeTab(panel.id, tabId)}
        onOpenFile={handleOpenFile}
        onDropFiles={(files) => openFiles(panel.id, files)}
        onClosePanel={handleClosePanel}
        onReorderTabs={handleReorderTabs}
        onMoveTab={handleMoveTab}
      />

      {panel.tabs.length > 0 ? (
        <div className="flex-1 min-h-0 relative">
          {panel.tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                'absolute inset-0 h-full w-full',
                tab.id === panel.activeTabId ? 'flex flex-col' : 'hidden'
              )}
            >
              <PdfViewer tab={tab} panelId={panel.id} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-sidebar text-muted-foreground gap-4">
          <div
            className="flex flex-col items-center gap-3 cursor-pointer hover:text-foreground transition-colors p-8 rounded-lg border border-dashed border-border hover:border-muted-foreground"
            onClick={handleOpenFile}
          >
            <FileUp className="h-12 w-12 opacity-30" />
            <span className="text-sm">Ouvrir un ou plusieurs fichiers PDF</span>
          </div>
        </div>
      )}
    </div>
  )
})
