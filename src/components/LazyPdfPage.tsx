import React, { useState, useEffect, useRef } from 'react'
import { Page } from 'react-pdf'
import type { PDFPageProxy } from 'pdfjs-dist'
import { PageEditLayer } from './edit/PageEditLayer'

type CustomTextRenderer = React.ComponentProps<typeof Page>['customTextRenderer']

interface LazyPdfPageProps {
  tabId: string
  pageNum: number
  baseWidth?: number
  zoom: number
  registerRef?: (pageNum: number, el: HTMLDivElement | null) => void
  customTextRenderer?: CustomTextRenderer
}

// memo : changer de page courante ne redessine pas toutes les pages du document
export const LazyPdfPage = React.memo(function LazyPdfPage({ tabId, pageNum, baseWidth, zoom, registerRef, customTextRenderer }: LazyPdfPageProps) {
  // Render pages 1 and 2 immediately; lazily render subsequent pages as user scrolls
  const [isVisible, setIsVisible] = useState(pageNum <= 2)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [pdfPage, setPdfPage] = useState<PDFPageProxy | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el || isVisible) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: '800px 0px', // Pre-render 800px before entering screen
      }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [isVisible])

  const effectiveWidth = baseWidth ? baseWidth * zoom : 600
  // Pixels CSS par unité de page : le calque d'édition suit le zoom
  const pageWidth = pdfPage ? pdfPage.getViewport({ scale: 1 }).width : 0
  const editScale = pageWidth ? (baseWidth ? (baseWidth * zoom) / pageWidth : zoom) : 0
  const estimatedHeight = effectiveWidth * 1.35

  return (
    <div
      ref={(node) => {
        containerRef.current = node
        registerRef?.(pageNum, node)
      }}
      className="mb-4 flex justify-center w-full min-w-fit"
      style={{ minHeight: isVisible ? undefined : estimatedHeight }}
    >
      {isVisible ? (
        <Page
          pageNumber={pageNum}
          width={baseWidth}
          scale={zoom}
          renderTextLayer={true}
          renderAnnotationLayer={true}
          customTextRenderer={customTextRenderer}
          onLoadSuccess={setPdfPage}
          className="shadow-lg"
          loading={
            <div
              style={{ width: effectiveWidth, height: estimatedHeight }}
              className="bg-card border border-border/40 animate-pulse rounded"
            />
          }
        >
          {pdfPage && editScale > 0 && (
            <PageEditLayer tabId={tabId} pageNum={pageNum} page={pdfPage} scale={editScale} />
          )}
        </Page>
      ) : (
        <div
          style={{ width: effectiveWidth, height: estimatedHeight }}
          className="bg-card/40 border border-border/20 rounded flex items-center justify-center text-muted-foreground/40 text-xs select-none"
        >
          Page {pageNum}
        </div>
      )}
    </div>
  )
})
