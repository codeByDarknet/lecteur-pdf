import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { PdfToolbar } from './PdfToolbar'
import { SearchBar } from './SearchBar'
import { ThumbnailSidebar } from './ThumbnailSidebar'
import { LazyPdfPage } from './LazyPdfPage'
import { EditToolbar } from './edit/EditToolbar'
import { pageSizes } from './edit/PageEditLayer'
import { clearPdfCache, getCachedPdfData } from '@/lib/fileCache'
import { exportEditedPdf } from '@/lib/pdfEditing'
import { fitImage, loadImageFile } from '@/lib/editImages'
import { generateId } from '@/lib/utils'
import { useEditStore } from '@/store/useEditStore'
import { extractPageTexts, findMatches, createHighlightRenderer, type PageText, type SearchMatch } from '@/lib/pdfSearch'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore, MIN_ZOOM, MAX_ZOOM } from '@/store/useAppStore'
import type { PdfTab } from '@/types'
import type { PDFDocumentProxy } from 'pdfjs-dist'

interface PdfViewerProps {
  tab: PdfTab
  panelId: string
}

function PdfViewerComponent({ tab, panelId }: PdfViewerProps) {
  const { setCurrentPage, setTotalPages, setZoom, toggleThumbnails, addPanel } = useAppStore(
    useShallow((s) => ({
      setCurrentPage: s.setCurrentPage,
      setTotalPages: s.setTotalPages,
      setZoom: s.setZoom,
      toggleThumbnails: s.toggleThumbnails,
      addPanel: s.addPanel,
    }))
  )
  // Valeurs primitives uniquement : défiler dans un autre onglet ne redessine pas celui-ci
  const showThumbnails = useAppStore((s) => s.panels.find((p) => p.id === panelId)?.showThumbnails ?? false)
  // Seul l'onglet visible du panel actif réagit aux raccourcis clavier
  const isActiveViewer = useAppStore(
    (s) => s.activePanelId === panelId && s.panels.find((p) => p.id === panelId)?.activeTabId === tab.id
  )
  const [fileData, setFileData] = useState<Uint8Array | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchFocusKey, setSearchFocusKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([])
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1)
  const [pageTexts, setPageTexts] = useState<PageText[] | null>(null)
  const [isDocLoaded, setIsDocLoaded] = useState(false)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const pageTextsPromiseRef = useRef<Promise<PageText[]> | null>(null)
  const searchIdRef = useRef(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Le conteneur n'existe qu'une fois le PDF chargé (rendu dans <Document>) : on suit son montage
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el
    setContainerEl(el)
  }, [])
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const editMode = useEditStore((s) => s.modes[tab.id])
  const fileVersion = useEditStore((s) => s.fileVersions[tab.filePath] ?? 0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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
  }, [tab.filePath, fileVersion])

  const onDocumentLoadSuccess = useCallback(
    (pdf: PDFDocumentProxy) => {
      pdfRef.current = pdf
      pageTextsPromiseRef.current = null
      setTotalPages(panelId, tab.id, pdf.numPages)
      setIsDocLoaded(true)
    },
    [panelId, tab.id, setTotalPages]
  )

  // Page courante = page dont le haut est le plus proche du haut de la zone visible.
  // Recherche dichotomique sur offsetTop (pages dans l'ordre), au plus une mesure par frame.
  const scrollFrameRef = useRef(0)
  const currentPageRef = useRef(tab.currentPage)
  currentPageRef.current = tab.currentPage
  useEffect(() => () => cancelAnimationFrame(scrollFrameRef.current), [])

  const handleScroll = useCallback(() => {
    if (scrollFrameRef.current) return
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = 0
      const container = containerRef.current
      const total = pageRefs.current.size
      if (!container || total === 0) return
      const scrollTop = container.scrollTop
      const topOf = (page: number) => pageRefs.current.get(page)?.offsetTop ?? 0

      let lo = 1
      let hi = total
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        if (topOf(mid) <= scrollTop) lo = mid
        else hi = mid - 1
      }
      const closestPage =
        lo < total && Math.abs(topOf(lo + 1) - scrollTop) < Math.abs(topOf(lo) - scrollTop) ? lo + 1 : lo

      if (closestPage !== currentPageRef.current) {
        setCurrentPage(panelId, tab.id, closestPage)
      }
    })
  }, [panelId, tab.id, setCurrentPage])

  const registerPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(pageNum, el)
  }, [])

  const scrollToPage = useCallback((pageNum: number, behavior: ScrollBehavior = 'smooth') => {
    const el = pageRefs.current.get(pageNum)
    if (el) {
      el.scrollIntoView({ behavior, block: 'start' })
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
  const handleGoToPage = useCallback((page: number) => {
    setCurrentPage(panelId, tab.id, page)
    scrollToPage(page)
  }, [panelId, tab.id, setCurrentPage, scrollToPage])

  const canSaveInPlace = !!window.electronAPI && !tab.filePath.startsWith('blob:')

  // Applique les modifications au PDF (pdf-lib) puis écrit le fichier
  const handleSave = useCallback(async (asCopy: boolean) => {
    const edit = useEditStore.getState()
    const objects = edit.edits[tab.id]?.objects ?? []
    const pdf = pdfRef.current
    if (objects.length === 0 || !pdf || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const original = await getCachedPdfData(tab.filePath)
      if (!original) throw new Error('Fichier d’origine illisible')
      const bytes = await exportEditedPdf(original, pdf, objects)
      const suggested = asCopy ? tab.fileName.replace(/\.pdf$/i, '') + ' (modifié).pdf' : tab.fileName
      const api = window.electronAPI
      if (!api) {
        // Hors Electron : téléchargement
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
        const a = document.createElement('a')
        a.href = url
        a.download = suggested
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 10000)
        return
      }
      let target = tab.filePath
      if (asCopy || !canSaveInPlace) {
        const dir = canSaveInPlace ? tab.filePath.slice(0, tab.filePath.length - tab.fileName.length) : ''
        const chosen = await api.saveFileDialog(dir + suggested)
        if (!chosen) return
        target = chosen
      }
      await api.writeFile(target, bytes)
      clearPdfCache(target)
      edit.clear(tab.id)
      if (target !== tab.filePath) {
        clearPdfCache(tab.filePath)
        useAppStore.getState().setTabFile(tab.id, target, target.split(/[\\/]/).pop() ?? target)
      }
      edit.bumpFileVersion(target)
    } catch (err) {
      console.error('Save failed:', err)
      setSaveError(`Enregistrement impossible : ${err instanceof Error ? err.message : err}`)
    } finally {
      setSaving(false)
    }
  }, [tab.id, tab.filePath, tab.fileName, canSaveInPlace, saving])

  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave

  // Raccourcis d'édition
  useEffect(() => {
    if (!isActiveViewer || !editMode) return
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
    const onKeyDown = (e: KeyboardEvent) => {
      const s = useEditStore.getState()
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (ctrl && key === 's') {
        e.preventDefault()
        handleSaveRef.current(e.shiftKey)
        return
      }
      if (isTyping(e.target)) return
      if (ctrl && key === 'z' && !e.shiftKey) {
        e.preventDefault()
        s.undo(tab.id)
      } else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault()
        s.redo(tab.id)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection?.tabId === tab.id) {
        e.preventDefault()
        s.remove(tab.id, [s.selection.id])
      } else if (e.key === 'Escape') {
        if (s.selection) s.select(null)
        else s.setTool(s.modes[tab.id] === 'ultra' ? 'edit-text' : 'select')
      }
    }
    // Coller une image depuis le presse-papiers : elle arrive au centre de la page courante
    const onPaste = async (e: ClipboardEvent) => {
      if (isTyping(e.target)) return
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      const page = useAppStore.getState().panels.flatMap((p) => p.tabs).find((t) => t.id === tab.id)?.currentPage ?? 1
      const size = pageSizes.get(`${tab.id}:${page}`)
      if (!size) return
      try {
        const img = await loadImageFile(file)
        const { w, h } = fitImage(img.width, img.height, size.w)
        const id = generateId()
        const s = useEditStore.getState()
        s.add(tab.id, { id, page, type: 'image', x: (size.w - w) / 2, y: (size.h - h) / 2, w, h, src: img.src })
        s.select({ tabId: tab.id, id })
      } catch (err) {
        console.error('Paste failed:', err)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('paste', onPaste)
    }
  }, [isActiveViewer, editMode, tab.id])

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
        setSearchFocusKey((k) => k + 1)
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
    const container = containerEl
    if (!container) return

    const updateWidth = () => {
      if (container.clientWidth > 0) {
        setContainerWidth(container.clientWidth)
      }
    }

    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerEl])

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

  // Session restaurée : revenir à la page où la lecture s'était arrêtée.
  // Les pages pas encore rendues ont une hauteur estimée : on se recale jusqu'à ce que la mise en page soit stable.
  const restoredPositionRef = useRef(false)
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(restoreTimerRef.current), [])

  useEffect(() => {
    if (restoredPositionRef.current || !isDocLoaded || !baseWidth || tab.totalPages === 0) return
    restoredPositionRef.current = true
    const target = tab.currentPage
    const container = containerRef.current
    if (target <= 1 || !container) return

    // L'utilisateur fait défiler lui-même : on arrête de recaler
    const stopRestore = () => {
      clearTimeout(restoreTimerRef.current)
      container.removeEventListener('wheel', stopRestore)
      container.removeEventListener('pointerdown', stopRestore)
    }
    container.addEventListener('wheel', stopRestore, { passive: true })
    container.addEventListener('pointerdown', stopRestore)

    let lastTop = -1
    let stableTicks = 0
    let ticks = 0
    const tick = () => {
      const el = pageRefs.current.get(target)
      if (el) {
        if (Math.abs(container.scrollTop - el.offsetTop) > 1) container.scrollTop = el.offsetTop
        stableTicks = el.offsetTop === lastTop ? stableTicks + 1 : 0
        lastTop = el.offsetTop
      }
      if (stableTicks < 3 && ticks++ < 30) restoreTimerRef.current = setTimeout(tick, 100)
      else stopRestore()
    }
    tick()
  }, [isDocLoaded, baseWidth, tab.totalPages, tab.currentPage])
  const fileProp = useMemo(() => fileData ? { data: fileData } : null, [fileData])
  const pages = Array.from({ length: tab.totalPages }, (_, i) => i + 1)

  // Recherche sur le texte extrait par pdf.js : couvre toutes les pages, même pas encore rendues
  const handleSearch = useCallback(async (query: string) => {
    const searchId = ++searchIdRef.current
    setSearchQuery(query)
    if (!query || !pdfRef.current) {
      setSearchMatches([])
      setActiveMatchIndex(-1)
      return
    }
    try {
      pageTextsPromiseRef.current ??= extractPageTexts(pdfRef.current)
      const texts = await pageTextsPromiseRef.current
      if (searchId !== searchIdRef.current) return
      const matches = findMatches(texts, query)
      setPageTexts(texts)
      setSearchMatches(matches)
      setActiveMatchIndex(matches.length > 0 ? 0 : -1)
    } catch (err) {
      console.error('Search error:', err)
    }
  }, [])

  const handleSearchNext = useCallback(() => {
    const n = searchMatches.length
    if (n === 0) return
    setActiveMatchIndex((i) => (i + 1) % n)
  }, [searchMatches.length])

  const handleSearchPrev = useCallback(() => {
    const n = searchMatches.length
    if (n === 0) return
    setActiveMatchIndex((i) => (i - 1 + n) % n)
  }, [searchMatches.length])

  const handleSearchClose = useCallback(() => {
    searchIdRef.current++
    setShowSearch(false)
    setSearchQuery('')
    setSearchMatches([])
    setActiveMatchIndex(-1)
  }, [])

  const customTextRenderer = useMemo(
    () =>
      searchQuery && pageTexts && searchMatches.length > 0
        ? createHighlightRenderer(pageTexts, searchMatches, activeMatchIndex)
        : undefined,
    [searchQuery, pageTexts, searchMatches, activeMatchIndex]
  )

  // Amène l'occurrence active à l'écran (la page peut ne pas encore être rendue)
  useEffect(() => {
    const match = searchMatches[activeMatchIndex]
    const container = containerRef.current
    if (!match || !container) return

    scrollToPage(match.page, 'auto')
    let attempts = 0
    let timer: ReturnType<typeof setTimeout>
    const reveal = () => {
      const el = container.querySelector('.search-match-active')
      if (el) {
        el.scrollIntoView({ block: 'center' })
      } else if (attempts++ < 40) {
        timer = setTimeout(reveal, 50)
      }
    }
    timer = setTimeout(reveal, 0)
    return () => clearTimeout(timer)
  }, [searchMatches, activeMatchIndex, scrollToPage])

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
        showThumbnails={showThumbnails}
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
        editing={!!editMode}
        onToggleEdit={() => useEditStore.getState().setMode(tab.id, editMode ? null : 'annotate')}
      />
      <EditToolbar
        tabId={tab.id}
        saving={saving}
        canSaveInPlace={canSaveInPlace}
        onSave={handleSave}
        onClose={() => useEditStore.getState().setMode(tab.id, null)}
      />
      {saveError && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-red-500/10 text-red-400 border-b border-red-500/30">
          <span className="flex-1">{saveError}</span>
          <button className="underline" onClick={() => setSaveError(null)}>Fermer</button>
        </div>
      )}
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
        {showThumbnails && (
          <ThumbnailSidebar
            totalPages={tab.totalPages}
            currentPage={tab.currentPage}
            onPageSelect={handleGoToPage}
          />
        )}
        <div className="flex-1 relative min-h-0">
          {showSearch && (
            <SearchBar
              focusKey={searchFocusKey}
              onSearch={handleSearch}
              onNext={handleSearchNext}
              onPrev={handleSearchPrev}
              onClose={handleSearchClose}
              currentMatch={activeMatchIndex + 1}
              totalMatches={searchMatches.length}
            />
          )}
          <div
            ref={setContainerRef}
            className="relative h-full overflow-auto bg-viewer p-4"
            onScroll={handleScroll}
          >
            {pages.map((pageNum) => (
              <LazyPdfPage
                key={pageNum}
                tabId={tab.id}
                pageNum={pageNum}
                baseWidth={baseWidth}
                zoom={tab.zoom}
                customTextRenderer={customTextRenderer}
                registerRef={registerPageRef}
              />
            ))}
          </div>
        </div>
      </Document>
    </div>
  )
}

export const PdfViewer = React.memo(PdfViewerComponent)
