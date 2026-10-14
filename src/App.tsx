import React, { useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TitleBar } from '@/components/TitleBar'
import { PanelManager } from '@/components/PanelManager'
import { useAppStore } from '@/store/useAppStore'
import { anyUnsavedEdits } from '@/store/useEditStore'
import { selectPdfFiles } from '@/lib/utils'
import type { SelectedPdfFile } from '@/types'

export default function App() {
  const theme = useAppStore((s) => s.theme)
  const openFiles = useAppStore((s) => s.openFiles)

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  // PDF ouverts depuis le système (« Ouvrir avec », double-clic, ligne de commande)
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.getPendingFiles) return
    const openInActivePanel = (files: SelectedPdfFile[]) => {
      if (files.length > 0) openFiles(useAppStore.getState().activePanelId, files)
    }
    const unsubscribe = api.onOpenFiles(openInActivePanel)
    api.getPendingFiles().then(openInActivePanel).catch((err) => console.error('Error getting pending files:', err))
    return unsubscribe
  }, [openFiles])

  // Electron affiche alors une confirmation avant de fermer (voir will-prevent-unload)
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (!anyUnsavedEdits()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [])

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        try {
          const files = await selectPdfFiles()
          if (files && files.length > 0) {
            const activePanelId = useAppStore.getState().activePanelId
            openFiles(activePanelId, files)
          }
        } catch (err) {
          console.error('Error opening files via shortcut:', err)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openFiles])

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-screen w-screen bg-background text-foreground">
        <TitleBar />
        <div className="flex flex-1 min-h-0">
          <PanelManager />
        </div>
      </div>
    </TooltipProvider>
  )
}
