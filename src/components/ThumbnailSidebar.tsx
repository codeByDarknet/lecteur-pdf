import React from 'react'
import { Page } from 'react-pdf'
import { cn } from '@/lib/utils'

interface ThumbnailSidebarProps {
  totalPages: number
  currentPage: number
  onPageSelect: (page: number) => void
}

export function ThumbnailSidebar({ totalPages, currentPage, onPageSelect }: ThumbnailSidebarProps) {
  if (totalPages <= 0) return null

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)

  return (
    <div className="w-[140px] shrink-0 border-r border-border bg-sidebar overflow-y-auto h-full py-2 select-none">
      {pages.map((pageNum) => (
        <div
          key={pageNum}
          className={cn(
            'mx-2 mb-2.5 cursor-pointer rounded-sm overflow-hidden border-2 transition-all flex flex-col items-center',
            currentPage === pageNum
              ? 'border-blue-500 shadow-md ring-1 ring-blue-500/30'
              : 'border-transparent hover:border-border'
          )}
          onClick={() => onPageSelect(pageNum)}
        >
          <Page
            pageNumber={pageNum}
            width={116}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={
              <div className="w-[116px] h-[150px] bg-accent/40 animate-pulse rounded-sm" />
            }
          />
          <div className="text-center text-[10px] text-muted-foreground py-1 font-medium">
            {pageNum}
          </div>
        </div>
      ))}
    </div>
  )
}
