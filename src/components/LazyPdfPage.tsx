import React, { useState, useEffect, useRef } from 'react'
import { Page } from 'react-pdf'

type CustomTextRenderer = React.ComponentProps<typeof Page>['customTextRenderer']

interface LazyPdfPageProps {
  pageNum: number
  baseWidth?: number
  zoom: number
  registerRef?: (pageNum: number, el: HTMLDivElement | null) => void
  customTextRenderer?: CustomTextRenderer
}

// memo : changer de page courante ne redessine pas toutes les pages du document
export const LazyPdfPage = React.memo(function LazyPdfPage({ pageNum, baseWidth, zoom, registerRef, customTextRenderer }: LazyPdfPageProps) {
  // Render pages 1 and 2 immediately; lazily render subsequent pages as user scrolls
  const [isVisible, setIsVisible] = useState(pageNum <= 2)
  const containerRef = useRef<HTMLDivElement | null>(null)

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
          className="shadow-lg"
          loading={
            <div
              style={{ width: effectiveWidth, height: estimatedHeight }}
              className="bg-card border border-border/40 animate-pulse rounded"
            />
          }
        />
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
