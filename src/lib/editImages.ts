// Lit une image (fichier ou presse-papiers) en data URL PNG/JPEG, seuls formats intégrables dans un PDF
export async function loadImageFile(file: File): Promise<{ src: string; width: number; height: number }> {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Image illisible'))
    el.src = src
  })
  if (/^data:image\/(png|jpeg)/.test(src)) return { src, width: img.naturalWidth, height: img.naturalHeight }
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  return { src: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight }
}

export function pickImageFile(): Promise<File | null> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml'
  return new Promise((resolve) => {
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

// Taille d'affichage par défaut : au plus 40 % de la largeur de la page
export function fitImage(width: number, height: number, pageWidth: number) {
  const w = Math.min(width, pageWidth * 0.4)
  return { w, h: (height * w) / width }
}
