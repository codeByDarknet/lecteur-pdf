import React, { useState } from 'react'
import { X, Plus, PanelRightClose, GripVertical } from 'lucide-react'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { cn } from '@/lib/utils'
import type { PdfTab } from '@/types'

interface TabBarProps {
  tabs: PdfTab[]
  activeTabId: string | null
  panelId: string
  showCloseButton: boolean
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onOpenFile: () => void
  onDropFiles?: (files: Array<{ filePath: string; fileName: string }>) => void
  onClosePanel?: () => void
  onReorderTabs: (fromIndex: number, toIndex: number) => void
  onMoveTab: (fromPanelId: string, tabId: string, insertIndex?: number) => void
}

export function TabBar({
  tabs,
  activeTabId,
  panelId,
  showCloseButton,
  onSelectTab,
  onCloseTab,
  onOpenFile,
  onDropFiles,
  onClosePanel,
  onReorderTabs,
  onMoveTab,
}: TabBarProps) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const handleDragStart = (e: React.DragEvent, tab: PdfTab, index: number) => {
    e.dataTransfer.setData(
      'application/pdf-tab',
      JSON.stringify({ tabId: tab.id, panelId, tabIndex: index })
    )
    e.dataTransfer.effectAllowed = 'move'
    // Add a drag image
    const el = e.currentTarget as HTMLElement
    e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    setDragOverIndex(null)

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/pdf-tab'))
      const { tabId, panelId: sourcePanelId, tabIndex: sourceIndex } = data

      if (sourcePanelId === panelId) {
        // Reorder within same panel
        if (sourceIndex !== dropIndex) {
          onReorderTabs(sourceIndex, dropIndex)
        }
      } else {
        // Move between panels
        onMoveTab(sourcePanelId, tabId, dropIndex)
      }
    } catch (err) {
      console.error('Drop error:', err)
    }
  }

  const handleDropOnBar = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverIndex(null)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles: Array<{ filePath: string; fileName: string }> = []
      for (const file of Array.from(e.dataTransfer.files)) {
        if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
          const path = (file as any).path || URL.createObjectURL(file)
          droppedFiles.push({ filePath: path, fileName: file.name })
        }
      }
      if (droppedFiles.length > 0) {
        onDropFiles?.(droppedFiles)
        return
      }
    }

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/pdf-tab'))
      const { tabId, panelId: sourcePanelId } = data

      if (sourcePanelId !== panelId) {
        // Move to end of this panel
        onMoveTab(sourcePanelId, panelId, tabs.length)
      }
    } catch (err) {
      console.error('Drop error:', err)
    }
  }

  return (
    <div
      className="flex items-center h-9 bg-header border-b border-border overflow-x-auto"
      onDragOver={(e) => {
        e.preventDefault()
        if (e.dataTransfer.types.includes('Files')) {
          e.dataTransfer.dropEffect = 'copy'
        } else {
          e.dataTransfer.dropEffect = 'move'
        }
      }}
      onDrop={handleDropOnBar}
    >
      <div className="flex items-center min-w-0 flex-1">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            draggable
            onDragStart={(e) => handleDragStart(e, tab, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            className={cn(
              'group flex items-center gap-1.5 h-9 px-3 text-xs cursor-grab active:cursor-grabbing border-r border-border min-w-0 max-w-[200px] transition-all select-none',
              activeTabId === tab.id
                ? 'bg-tabActive text-foreground border-b-2 border-b-blue-500'
                : 'text-muted-foreground hover:bg-accent/50',
              dragOverIndex === index && 'border-l-2 border-l-blue-500 bg-blue-500/10'
            )}
            onClick={() => onSelectTab(tab.id)}
          >
            <GripVertical className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none" />
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-50 pointer-events-none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="truncate select-none pointer-events-none">{tab.fileName}</span>
            <button
              className="ml-auto shrink-0 rounded-sm p-0.5 opacity-0 group-hover:opacity-100 hover:bg-accent transition-opacity"
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(tab.id)
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-none text-muted-foreground"
            onClick={onOpenFile}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ouvrir des fichiers PDF</TooltipContent>
      </Tooltip>

      {showCloseButton && onClosePanel && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-none text-muted-foreground hover:text-red-400"
              onClick={onClosePanel}
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fermer ce panel</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
