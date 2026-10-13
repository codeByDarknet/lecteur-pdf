import React from 'react'
import { PanelGroup, Panel as ResizablePanel, PanelResizeHandle } from 'react-resizable-panels'
import { PdfPanel } from './Panel'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store/useAppStore'
import { GripVertical } from 'lucide-react'

export function PanelManager() {
  const { panels, splitDirection, activePanelId } = useAppStore(
    useShallow((s) => ({ panels: s.panels, splitDirection: s.splitDirection, activePanelId: s.activePanelId }))
  )

  if (panels.length === 0) return null

  return (
    <PanelGroup direction={splitDirection} className="flex-1">
      {panels.map((panel, index) => (
        <React.Fragment key={panel.id}>
          {index > 0 && (
            <PanelResizeHandle className="group relative w-[6px] bg-border hover:bg-blue-500 transition-colors data-[resize-handle-active]:bg-blue-500 flex items-center justify-center">
              <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
              <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </PanelResizeHandle>
          )}
          <ResizablePanel minSize={20} id={panel.id} order={index}>
            <PdfPanel
              panel={panel}
              isActive={panel.id === activePanelId}
              showCloseButton={panels.length > 1}
            />
          </ResizablePanel>
        </React.Fragment>
      ))}
    </PanelGroup>
  )
}
