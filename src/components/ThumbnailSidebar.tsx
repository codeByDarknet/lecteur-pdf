import React, { useEffect, useRef, useState } from 'react'
import { Page } from 'react-pdf'
import { cn } from '@/lib/utils'

interface ThumbnailSidebarProps {
  totalPages: number
  currentPage: number
  onPageSelect: (page: number) => void
}

const THUMB_WIDTH = 116

const ThumbnailPlaceholder = () => (
  <div className="w-[116px] h-[150px] bg-accent/40 animate-pulse rounded-sm" />
)

interface ThumbnailProps {
  pageNum: number
  isCurrent: boolean
  onPageSelect: (page: number) => void
  root: HTMLDivElement | null
}

// Une miniature n'est dessinée qu'à l'approche de la zone visible, puis reste en place
const Thumbnail = React.memo(function Thumbnail({ pageNum, isCurrent, onPageSelect, root }: ThumbnailProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || !root || isVisible) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { root, rootMargin: '400px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [root, isVisible])

  useEffect(() => {
    if (isCurrent) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [isCurrent])

  return (
    <div
      ref={ref}
      className={cn(
        'mx-2 mb-2.5 cursor-pointer rounded-sm overflow-hidden border-2 transition-all flex flex-col items-center',
        isCurrent
          ? 'border-blue-500 shadow-md ring-1 ring-blue-500/30'
          : 'border-transparent hover:border-border'
      )}
      onClick={() => onPageSelect(pageNum)}
    >
      {isVisible ? (
        <Page
          pageNumber={pageNum}
          width={THUMB_WIDTH}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          loading={<ThumbnailPlaceholder />}
        />
      ) : (
        <ThumbnailPlaceholder />
      )}
      <div className="text-center text-[10px] text-muted-foreground py-1 font-medium">
        {pageNum}
      </div>
    </div>
  )
})

export function ThumbnailSidebar({ totalPages, currentPage, onPageSelect }: ThumbnailSidebarProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null)

  if (totalPages <= 0) return null

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)

  return (
    <div ref={setRoot} className="w-[140px] shrink-0 border-r border-border bg-sidebar overflow-y-auto h-full py-2 select-none">
      {pages.map((pageNum) => (
        <Thumbnail
          key={pageNum}
          pageNum={pageNum}
          isCurrent={currentPage === pageNum}
          onPageSelect={onPageSelect}
          root={root}
        />
      ))}
    </div>
  )
}
