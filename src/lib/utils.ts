import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

export async function selectPdfFiles(): Promise<Array<{ filePath: string; fileName: string }>> {
  if (window.electronAPI) {
    const result = await window.electronAPI.openFileDialog()
    if (!result) return []
    if (Array.isArray(result)) {
      return result
    }
    if ((result as any).filePath) {
      return [result as any]
    }
    return []
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.pdf'
  input.multiple = true
  return new Promise((resolve) => {
    input.onchange = () => {
      if (input.files && input.files.length > 0) {
        const list = Array.from(input.files).map((file) => ({
          filePath: URL.createObjectURL(file),
          fileName: file.name,
        }))
        resolve(list)
      } else {
        resolve([])
      }
    }
    input.click()
  })
}

