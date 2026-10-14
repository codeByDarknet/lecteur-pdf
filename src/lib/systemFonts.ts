// Polices installées sur l'ordinateur, chargées à la demande pour le mode édition ultra :
// affichées via FontFace et intégrées telles quelles dans le PDF enregistré.

export interface SystemFont {
  id: string
  label: string // nom affiché dans la barre d'outils
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

export function findSystemFont(pdfFontName: string, bold: boolean, italic: boolean): Promise<SystemFont | null> {
  const api = window.electronAPI
  if (!pdfFontName || !api?.findFont) return Promise.resolve(null)
  const key = `${pdfFontName}|${bold}|${italic}`
  let lookup = lookups.get(key)
  if (!lookup) {
    lookup = (async () => {
      const found = await api.findFont(pdfFontName, bold, italic)
      if (!found) return null
      const id = hash(found.file)
      if (!fontBytes.has(id)) {
        const face = new FontFace(systemFontFamily(id), new Uint8Array(found.data))
        document.fonts.add(await face.load())
        fontBytes.set(id, found.data)
        labels.set(id, found.file.split(/[\\/]/).pop()!.replace(/\.(ttf|otf)$/i, '').replace(/\[.*\]/, ''))
      }
      return { id, label: labels.get(id)! }
    })().catch(() => null)
    lookups.set(key, lookup)
  }
  return lookup
}
