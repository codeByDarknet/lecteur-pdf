import React, { useState, useEffect } from 'react'
import { Minus, Square, X, Copy, Sun, Moon } from 'lucide-react'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { useAppStore } from '@/store/useAppStore'

export function TitleBar() {
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.isMaximized) return
    api.isMaximized().then(setIsMaximized)
    return api.onMaximizedChange?.(setIsMaximized)
  }, [])

  const handleMinimize = () => window.electronAPI?.minimizeWindow()
  const handleMaximize = () => window.electronAPI?.maximizeWindow()
  const handleClose = () => window.electronAPI?.closeWindow()

  return (
    <div className="flex items-center justify-between h-10 bg-header border-b border-border select-none">
      {/* App title / drag region */}
      <div className="flex items-center gap-2 px-4 flex-1" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <img src="./pdf_multipanel_logo.svg" alt="" width={20} height={20} draggable={false} />
        <span className="text-xs text-muted-foreground font-medium">Lecteur PDF</span>
      </div>

      {/* Theme toggle & Window controls */}
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-none hover:bg-accent text-muted-foreground"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
          </TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-none hover:bg-accent text-muted-foreground"
          onClick={handleMinimize}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-none hover:bg-accent text-muted-foreground"
          onClick={handleMaximize}
        >
          {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-none hover:bg-destructive text-muted-foreground hover:text-white"
          onClick={handleClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
