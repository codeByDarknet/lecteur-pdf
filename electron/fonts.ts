import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'

// Recherche, parmi les polices installées, celle qu'utilise un PDF, pour que le texte modifié en
// mode édition ultra garde exactement son apparence d'origine.

interface InstalledFont {
  file: string
  families: string[] // noms normalisés, le premier est le nom principal
  weight: number // 400 normal, 700 gras
  italic: boolean
  width: number // 100 = chasse normale
}

// Polices de Microsoft Office remplacées sous Linux par des équivalents aux mêmes dimensions
const ALIASES: Record<string, string> = { calibri: 'carlito', cambria: 'caladea' }

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// « BAAAAA+TimesNewRomanPS-BoldMT » → « timesnewroman »
export function familyOf(pdfFontName: string): string {
  const base = pdfFontName.replace(/^[A-Z]{6}\+/, '').split(/[-,]/)[0]
  return normalize(base).replace(/(psmt|mt|ps)$/, '')
}

const run = (cmd: string, args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile(cmd, args, { maxBuffer: 32 * 1024 * 1024 }, (err, out) => (err ? reject(err) : resolve(out))),
  )

// fc-list : poids 80 = normal, 200 = gras ; inclinaison 0 = droit ; chasse 100 = normale
async function listWithFontconfig(): Promise<InstalledFont[]> {
  const out = await run('fc-list', ['--format', '%{file}\t%{family}\t%{weight}\t%{slant}\t%{width}\n'])
  return out
    .split('\n')
    .map((row) => row.split('\t'))
    .filter((cols) => cols.length === 5)
    .map(([file, family, weight, slant, width]) => ({
      file,
      families: family.split(',').map(normalize),
      weight: Number(weight) >= 180 ? 700 : 400,
      italic: Number(slant) > 0,
      width: Number(width) || 100,
    }))
}

function fontDirectories(): string[] {
  if (process.platform === 'win32') {
    return [
      path.join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Windows', 'Fonts'),
    ]
  }
  if (process.platform === 'darwin') {
    return ['/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts', path.join(os.homedir(), 'Library/Fonts')]
  }
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.local/share/fonts'), path.join(os.homedir(), '.fonts')]
}

// Sans fontconfig (Windows, macOS) : on lit le nom de chaque fichier de police
async function listByScanning(): Promise<InstalledFont[]> {
  const fonts: InstalledFont[] = []
  const walk = async (dir: string, depth: number) => {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory() && depth < 3) await walk(file, depth + 1)
      else if (/\.(ttf|otf)$/i.test(entry.name)) {
        try {
          const font = fontkit.create(await fs.promises.readFile(file))
          const sub = font.subfamilyName ?? ''
          const os2 = (font as unknown as { 'OS/2'?: { usWeightClass?: number; usWidthClass?: number } })['OS/2']
          fonts.push({
            file,
            families: [normalize(font.familyName ?? '')],
            weight: (os2?.usWeightClass ?? (/bold/i.test(sub) ? 700 : 400)) >= 600 ? 700 : 400,
            italic: /italic|oblique/i.test(sub),
            width: ((os2?.usWidthClass ?? 5) / 5) * 100,
          })
        } catch {
          /* fichier illisible : ignoré */
        }
      }
    }
  }
  for (const dir of fontDirectories()) await walk(dir, 0)
  return fonts
}

let installed: Promise<InstalledFont[]> | null = null
const installedFonts = () =>
  (installed ??= (process.platform === 'linux' ? listWithFontconfig().catch(() => listByScanning()) : listByScanning()).then(
    // pdf-lib ne sait pas intégrer les collections (.ttc) ni les anciens formats
    (list) => list.filter((f) => /\.(ttf|otf)$/i.test(f.file)),
  ))

export async function findFont(pdfFontName: string, bold: boolean, italic: boolean): Promise<{ file: string; data: Uint8Array } | null> {
  const wanted = familyOf(pdfFontName)
  if (wanted.length < 3) return null
  const names = [wanted, ALIASES[wanted]].filter(Boolean)
  const candidates = (await installedFonts())
    .map((f) => {
      // Nom principal exact > nom secondaire ; puis bon style, chasse normale
      const rank = names.includes(f.families[0]) ? 0 : f.families.some((n) => names.includes(n)) ? 1 : -1
      if (rank < 0) return null
      const score =
        rank * 100 + (f.weight === (bold ? 700 : 400) ? 0 : 10) + (f.italic === italic ? 0 : 10) + Math.abs(f.width - 100) / 10
      return { f, score }
    })
    .filter((c): c is { f: InstalledFont; score: number } => c !== null)
    .sort((a, b) => a.score - b.score)
  const best = candidates[0]
  // Un style trop éloigné (gras demandé, seul le normal existe…) fausserait le rendu
  if (!best || best.score % 100 >= 10) return null
  try {
    return { file: best.f.file, data: new Uint8Array(await fs.promises.readFile(best.f.file)) }
  } catch {
    return null
  }
}
