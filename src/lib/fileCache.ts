const cache = new Map<string, Uint8Array>()

export async function getCachedPdfData(filePath: string): Promise<Uint8Array | null> {
  const cached = cache.get(filePath)
  if (cached && cached.byteLength > 0) {
    // Return a clone so worker transfer cannot neuter the cached buffer
    return cached.slice()
  }

  if (window.electronAPI) {
    const data = await window.electronAPI.readFile(filePath)
    if (!data) return null
    const uint8 = new Uint8Array(data)
    // Store master copy in cache
    cache.set(filePath, uint8)
    // Return independent clone
    return uint8.slice()
  } else {
    const response = await fetch(filePath)
    const buffer = await response.arrayBuffer()
    const uint8 = new Uint8Array(buffer)
    cache.set(filePath, uint8)
    return uint8.slice()
  }
}

export function clearPdfCache(filePath?: string) {
  if (filePath) {
    cache.delete(filePath)
  } else {
    cache.clear()
  }
}
