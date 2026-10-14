import React from 'react'
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  ChevronLeft,
  ChevronRight,
  Search,
  PanelLeftClose,
  PanelLeft,
  Columns,
  Rows,
  SplitSquareHorizontal,
  FilePen,
} from 'lucide-react'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Separator } from './ui/separator'
import { Input } from './ui/input'

interface PdfToolbarProps {
  currentPage: number
  totalPages: number
  zoom: number
  showThumbnails: boolean
  showSearch: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomFit: () => void
  onPrevPage: () => void
  onNextPage: () => void
  onGoToPage: (page: number) => void
  onToggleThumbnails: () => void
  onToggleSearch: () => void
  onSplitPanel: () => void
  editing: boolean
  onToggleEdit: () => void
}

export function PdfToolbar({
  currentPage,
  totalPages,
  zoom,
  showThumbnails,
  showSearch,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onPrevPage,
  onNextPage,
  onGoToPage,
  onToggleThumbnails,
  onToggleSearch,
  onSplitPanel,
  editing,
  onToggleEdit,
}: PdfToolbarProps) {
  const [pageInput, setPageInput] = React.useState(String(currentPage))

  React.useEffect(() => {
    setPageInput(String(currentPage))
  }, [currentPage])

  const handlePageSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const page = parseInt(pageInput, 10)
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        onGoToPage(page)
      } else {
        setPageInput(String(currentPage))
      }
    }
  }

  return (
    <div className="flex items-center gap-0.5 h-10 px-2 bg-toolbar border-b border-border">
      {/* Thumbnails toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onToggleThumbnails} className="text-muted-foreground">
            {showThumbnails ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{showThumbnails ? 'Masquer miniatures' : 'Afficher miniatures'}</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Navigation */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onPrevPage} disabled={currentPage <= 1} className="text-muted-foreground">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Page précédente</TooltipContent>
      </Tooltip>

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Input
          className="w-12 h-6 text-center text-xs bg-background border-border"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={handlePageSubmit}
          onBlur={() => setPageInput(String(currentPage))}
        />
        <span>/ {totalPages}</span>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onNextPage} disabled={currentPage >= totalPages} className="text-muted-foreground">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Page suivante</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Zoom */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onZoomOut} className="text-muted-foreground">
            <ZoomOut className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom arrière</TooltipContent>
      </Tooltip>

      <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
        {Math.round(zoom * 100)}%
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onZoomIn} className="text-muted-foreground">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom avant</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onZoomFit} className="text-muted-foreground">
            <Maximize className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ajuster à la page</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Search */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onToggleSearch} className={showSearch ? 'text-blue-400' : 'text-muted-foreground'}>
            <Search className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Rechercher</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleEdit}
        className={editing ? 'h-7 gap-1.5 px-2.5 text-xs bg-blue-500/15 text-blue-500 hover:bg-blue-500/20 hover:text-blue-500' : 'h-7 gap-1.5 px-2.5 text-xs text-muted-foreground'}
      >
        <FilePen className="h-3.5 w-3.5" />
        Éditer
      </Button>

      {/* Split panel */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onSplitPanel} className="text-muted-foreground">
            <SplitSquareHorizontal className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Nouveau panel</TooltipContent>
      </Tooltip>
    </div>
  )
}
