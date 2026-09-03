import React, { useState, useEffect } from 'react'
import { Minus, Square, X, Copy, Sun, Moon } from 'lucide-react'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { useAppStore } from '@/store/useAppStore'

export function TitleBar() {
  const { theme, toggleTheme } = useAppStore()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const checkMaximized = async () => {
      if (window.electronAPI?.isMaximized) {
        const maximized = await window.electronAPI.isMaximized()
        setIsMaximized(maximized)
      }
    }
    checkMaximized()
    const interval = setInterval(checkMaximized, 500)
    return () => clearInterval(interval)
  }, [])

  const handleMinimize = () => window.electronAPI?.minimizeWindow()
  const handleMaximize = async () => {
    await window.electronAPI?.maximizeWindow()
    const maximized = await window.electronAPI?.isMaximized()
    setIsMaximized(maximized ?? false)
  }
  const handleClose = () => window.electronAPI?.closeWindow()

  return (
    <div className="flex items-center justify-between h-10 bg-header border-b border-border select-none">
      {/* App title / drag region */}
      <div className="flex items-center gap-2 px-4 flex-1" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
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
