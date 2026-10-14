// Polices installées sur l'ordinateur, chargées à la demande pour le mode édition :
// affichées via FontFace et intégrées telles quelles dans le PDF enregistré.

import type { FoundFont } from '@/types'

export interface SystemFont {
  id: string
  label: string // nom de famille, affiché dans la barre d'outils
}

export interface FontFamilyInfo {
  family: string
  latin: boolean
  bold: boolean
  italic: boolean
}

const lookups = new Map<string, Promise<SystemFont | null>>()
const fontBytes = new Map<string, Uint8Array>()
const labels = new Map<string, string>()

const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export const systemFontFamily = (id: string) => `zk-font-${id}`
export const systemFontBytes = (id: string) => fontBytes.get(id)
export const systemFontLabel = (id: string) => labels.get(id) ?? id

async function register(found: FoundFont | null): Promise<SystemFont | null> {
  if (!found) return null
  const id = hash(found.file)
  if (!fontBytes.has(id)) {
    const face = new FontFace(systemFontFamily(id), new Uint8Array(found.data))
    document.fonts.add(await face.load())
    fontBytes.set(id, found.data)
    labels.set(id, found.family)
  }
  return { id, label: labels.get(id)! }
}

const cached = (key: string, load: () => Promise<FoundFont | null>) => {
  let lookup = lookups.get(key)
  if (!lookup) {
    lookup = load().then(register).catch(() => null)
    lookups.set(key, lookup)
  }
  return lookup
}

// Police utilisée par un PDF, si elle est installée dans le style exact demandé
export function findSystemFont(pdfFontName: string, bold: boolean, italic: boolean): Promise<SystemFont | null> {
  const api = window.electronAPI
  if (!pdfFontName || !api?.findFont) return Promise.resolve(null)
  return cached(`pdf|${pdfFontName}|${bold}|${italic}`, () => api.findFont(pdfFontName, bold, italic))
}

// Famille choisie par l'utilisateur : la variante la plus proche du style demandé
export function loadFontFamily(family: string, bold: boolean, italic: boolean): Promise<SystemFont | null> {
  const api = window.electronAPI
  if (!api?.findFontFamily) return Promise.resolve(null)
  return cached(`family|${family}|${bold}|${italic}`, () => api.findFontFamily(family, bold, italic))
}

let families: Promise<FontFamilyInfo[]> | null = null
export const listFontFamilies = () =>
  (families ??= (window.electronAPI?.listFonts?.() ?? Promise.resolve([])).catch(() => []))
