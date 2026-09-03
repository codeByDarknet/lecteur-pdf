import React, { useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TitleBar } from '@/components/TitleBar'
import { PanelManager } from '@/components/PanelManager'
import { useAppStore } from '@/store/useAppStore'
import { selectPdfFiles } from '@/lib/utils'

export default function App() {
  const { theme, openFiles } = useAppStore()

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

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
