import React, { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface SearchBarProps {
  onSearch: (query: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  currentMatch: number
  totalMatches: number
}

export function SearchBar({ onSearch, onNext, onPrev, onClose, currentMatch, totalMatches }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, onSearch])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        onPrev()
      } else {
        onNext()
      }
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="absolute top-2 right-2 z-50 flex items-center gap-1 bg-popover text-popover-foreground border border-border rounded-md px-2 py-1 shadow-lg">
      <Input
        ref={inputRef}
        className="w-48 h-7 text-xs bg-background"
        placeholder="Rechercher..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {query && (
        <span className="text-xs text-muted-foreground min-w-[4rem] text-center">
          {totalMatches > 0 ? `${currentMatch}/${totalMatches}` : 'Aucun'}
        </span>
      )}
      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={onPrev} disabled={totalMatches === 0}>
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={onNext} disabled={totalMatches === 0}>
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={onClose}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
