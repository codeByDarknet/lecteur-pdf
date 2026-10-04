import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { PdfToolbar } from './PdfToolbar'
import { SearchBar } from './SearchBar'
import { ThumbnailSidebar } from './ThumbnailSidebar'
import { LazyPdfPage } from './LazyPdfPage'
import { getCachedPdfData } from '@/lib/fileCache'
import { useAppStore, MIN_ZOOM, MAX_ZOOM } from '@/store/useAppStore'
import type { PdfTab } from '@/types'

interface PdfViewerProps {
  tab: PdfTab
  panelId: string
}

export function PdfViewer({ tab, panelId }: PdfViewerProps) {
  const { setCurrentPage, setTotalPages, setZoom, toggleThumbnails, addPanel } = useAppStore()
  const panel = useAppStore((s) => s.panels.find((p) => p.id === panelId))
  // Seul l'onglet visible du panel actif réagit aux raccourcis clavier
  const isActiveViewer = useAppStore((s) => s.activePanelId === panelId) && panel?.activeTabId === tab.id
  const [fileData, setFileData] = useState<Uint8Array | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchCurrentMatch, setSearchCurrentMatch] = useState(0)
  const [searchTotalMatches, setSearchTotalMatches] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  // Load file data (with memory cache)
  useEffect(() => {
    let isMounted = true
    const loadFile = async () => {
      try {
        setLoadError(null)
        const data = await getCachedPdfData(tab.filePath)
        if (!isMounted) return
        if (!data) {
          setLoadError('Impossible de lire le fichier')
          return
        }
        setFileData(data)
      } catch (err) {
        if (!isMounted) return
        console.error('Failed to load PDF:', err)
        setLoadError(`Erreur: ${err}`)
      }
    }
    loadFile()
    return () => {
      isMounted = false
    }
  }, [tab.filePath])

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setTotalPages(panelId, tab.id, numPages)
    },
    [panelId, tab.id, setTotalPages]
  )

  // Scroll tracking for current page
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const scrollTop = container.scrollTop
    const containerHeight = container.clientHeight

    let closestPage = tab.currentPage
    let closestDistance = Infinity

    pageRefs.current.forEach((el, pageNum) => {
      const rect = el.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const relativeTop = rect.top - containerRect.top
      const distance = Math.abs(relativeTop)

      if (distance < closestDistance) {
        closestDistance = distance
        closestPage = pageNum
      }
    })

    if (closestPage !== tab.currentPage) {
      setCurrentPage(panelId, tab.id, closestPage)
    }
  }, [panelId, tab.id, tab.currentPage, setCurrentPage])

  const scrollToPage = useCallback((pageNum: number) => {
    const el = pageRefs.current.get(pageNum)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const handleZoomIn = () => setZoom(panelId, tab.id, tab.zoom + 0.15)
  const handleZoomOut = () => setZoom(panelId, tab.id, tab.zoom - 0.15)
  const handleZoomFit = () => setZoom(panelId, tab.id, 1)
  const handlePrevPage = () => {
    if (tab.currentPage > 1) {
      const newPage = tab.currentPage - 1
      setCurrentPage(panelId, tab.id, newPage)
      scrollToPage(newPage)
    }
  }
  const handleNextPage = () => {
    if (tab.currentPage < tab.totalPages) {
      const newPage = tab.currentPage + 1
      setCurrentPage(panelId, tab.id, newPage)
      scrollToPage(newPage)
    }
  }
  const handleGoToPage = (page: number) => {
    setCurrentPage(panelId, tab.id, page)
    scrollToPage(page)
  }

  // Keyboard shortcuts (ref pour toujours appeler les handlers à jour)
  const shortcutHandlersRef = useRef({ handleZoomIn, handleZoomOut, handleZoomFit })
  shortcutHandlersRef.current = { handleZoomIn, handleZoomOut, handleZoomFit }

  useEffect(() => {
    if (!isActiveViewer) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return
      const handlers = shortcutHandlersRef.current
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setShowSearch(true)
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        handlers.handleZoomIn()
      } else if (e.key === '-') {
        e.preventDefault()
        handlers.handleZoomOut()
      } else if (e.key === '0') {
        e.preventDefault()
        handlers.handleZoomFit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActiveViewer])

  // Container width observation for automatic responsive resizing
  const [containerWidth, setContainerWidth] = useState<number>(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateWidth = () => {
      if (container.clientWidth > 0) {
        setContainerWidth(container.clientWidth)
      }
    }

    updateWidth()

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        if (width > 0) {
          setContainerWidth(width)
        }
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [fileData])

  // Ctrl + mouse wheel zoom (intercepted globally on window with coordinates check)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const isInside = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      )

      if (isInside) {
        e.preventDefault()
        e.stopPropagation()
        const zoomDelta = e.deltaY < 0 ? 0.1 : -0.1
        const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((tab.zoom + zoomDelta) * 10) / 10))
        setZoom(panelId, tab.id, nextZoom)
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [panelId, tab.id, tab.zoom, setZoom])

  const baseWidth = containerWidth > 64 ? Math.max(200, containerWidth - 48) : undefined
  const fileProp = useMemo(() => fileData ? { data: fileData } : null, [fileData])
  const pages = Array.from({ length: tab.totalPages }, (_, i) => i + 1)

  const handleSearch = useCallback((query: string) => {
    // Basic search - we'll count matches in visible text
    if (!query) {
      setSearchTotalMatches(0)
      setSearchCurrentMatch(0)
      return
    }
    // Search through text layer spans
    if (containerRef.current) {
      const spans = containerRef.current.querySelectorAll('.react-pdf__Page__textContent span')
      let count = 0
      spans.forEach((span) => {
        const el = span as HTMLElement
        const text = el.textContent || ''
        if (text.toLowerCase().includes(query.toLowerCase())) {
          el.classList.add('search-match')
          count++
        } else {
          el.classList.remove('search-match', 'search-match-active')
        }
      })
      setSearchTotalMatches(count)
      setSearchCurrentMatch(count > 0 ? 1 : 0)

      // Highlight first match
      if (count > 0) {
        const matches = containerRef.current.querySelectorAll('.search-match')
        matches[0]?.classList.add('search-match-active')
        matches[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [])

  const handleSearchNext = useCallback(() => {
    if (!containerRef.current || searchTotalMatches === 0) return
    const matches = containerRef.current.querySelectorAll('.search-match')
    const nextIndex = searchCurrentMatch % searchTotalMatches
    matches.forEach((el) => el.classList.remove('search-match-active'))
    matches[nextIndex]?.classList.add('search-match-active')
    matches[nextIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setSearchCurrentMatch(nextIndex + 1)
  }, [searchCurrentMatch, searchTotalMatches])

  const handleSearchPrev = useCallback(() => {
    if (!containerRef.current || searchTotalMatches === 0) return
    const matches = containerRef.current.querySelectorAll('.search-match')
    const prevIndex = (searchCurrentMatch - 2 + searchTotalMatches) % searchTotalMatches
    matches.forEach((el) => el.classList.remove('search-match-active'))
    matches[prevIndex]?.classList.add('search-match-active')
    matches[prevIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setSearchCurrentMatch(prevIndex + 1)
  }, [searchCurrentMatch, searchTotalMatches])

  const handleSearchClose = useCallback(() => {
    setShowSearch(false)
    setSearchTotalMatches(0)
    setSearchCurrentMatch(0)
    if (containerRef.current) {
      containerRef.current.querySelectorAll('.search-match, .search-match-active').forEach((el) => {
        el.classList.remove('search-match', 'search-match-active')
      })
    }
  }, [])

  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        <div className="text-center">
          <p className="text-sm">{loadError}</p>
        </div>
      </div>
    )
  }

  if (!fileData) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="animate-pulse">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PdfToolbar
        currentPage={tab.currentPage}
        totalPages={tab.totalPages}
        zoom={tab.zoom}
        showThumbnails={panel?.showThumbnails ?? false}
        showSearch={showSearch}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomFit={handleZoomFit}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onGoToPage={handleGoToPage}
        onToggleThumbnails={() => toggleThumbnails(panelId)}
        onToggleSearch={() => setShowSearch(!showSearch)}
        onSplitPanel={() => addPanel(tab)}
      />
      <Document
        file={fileProp}
        onLoadSuccess={onDocumentLoadSuccess}
        className="flex flex-1 min-h-0 overflow-hidden"
        loading={
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="animate-pulse text-muted-foreground">Chargement du PDF...</div>
          </div>
        }
        error={
          <div className="flex-1 flex items-center justify-center h-full text-destructive">
            Erreur de chargement du PDF
          </div>
        }
      >
        {panel?.showThumbnails && (
          <ThumbnailSidebar
            totalPages={tab.totalPages}
            currentPage={tab.currentPage}
            onPageSelect={handleGoToPage}
          />
        )}
        <div className="flex-1 relative min-h-0">
          {showSearch && (
            <SearchBar
              onSearch={handleSearch}
              onNext={handleSearchNext}
              onPrev={handleSearchPrev}
              onClose={handleSearchClose}
              currentMatch={searchCurrentMatch}
              totalMatches={searchTotalMatches}
            />
          )}
          <div
            ref={containerRef}
            className="h-full overflow-auto bg-viewer p-4"
            onScroll={handleScroll}
          >
            {pages.map((pageNum) => (
              <LazyPdfPage
                key={pageNum}
                pageNum={pageNum}
                baseWidth={baseWidth}
                zoom={tab.zoom}
                registerRef={(el) => {
                  if (el) pageRefs.current.set(pageNum, el)
                }}
              />
            ))}
          </div>
        </div>
      </Document>
    </div>
  )
}
