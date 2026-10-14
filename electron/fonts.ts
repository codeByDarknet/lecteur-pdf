import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'

// Recherche, parmi les polices installées, celle qu'utilise un PDF, pour que le texte modifié en
// mode édition ultra garde exactement son apparence d'origine.

interface InstalledFont {
  file: string
  names: string[] // noms de famille tels qu'affichés, le premier est le nom principal
  families: string[] // les mêmes, normalisés
  weight: number // échelle CSS : 400 normal, 700 gras
  italic: boolean
  width: number // 100 = chasse normale
  latin: boolean // couvre l'alphabet latin (sinon : symboles, autre écriture)
}

export interface FontFamily {
  family: string
  latin: boolean
  bold: boolean // une variante grasse existe
  italic: boolean // une variante italique existe
}

export interface FoundFont {
  file: string
  family: string
  data: Uint8Array
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

const isBold = (weight: number) => weight >= 600

// Poids fontconfig → poids CSS (80 = normal, 180 = demi-gras, 200 = gras)
const FC_WEIGHTS: Array<[number, number]> = [[0, 100], [40, 200], [50, 300], [80, 400], [100, 500], [180, 600], [200, 700], [205, 800], [210, 900]]
const cssWeight = (fc: number) => FC_WEIGHTS.reduce((best, w) => (Math.abs(w[0] - fc) < Math.abs(best[0] - fc) ? w : best))[1]

// fc-list : inclinaison 0 = droit ; chasse 100 = normale
async function listWithFontconfig(): Promise<InstalledFont[]> {
  const out = await run('fc-list', ['--format', '%{file}\t%{family}\t%{weight}\t%{slant}\t%{width}\t%{variable}\t%{lang}\n'])
  return out
    .split('\n')
    .map((row) => row.split('\t'))
    // Polices variables : pdf-lib n'en intégrerait que l'instance par défaut
    .filter((cols) => cols.length === 7 && cols[5] !== 'True' && !Number.isNaN(Number(cols[2])))
    .map(([file, family, weight, slant, width, , lang]) => {
      const names = family.split(',').map((n) => n.replace(/\\/g, '').trim()).filter(Boolean)
      return {
        file,
        names,
        families: names.map(normalize),
        weight: cssWeight(Number(weight)),
        italic: Number(slant) > 0,
        width: Number(width) || 100,
        latin: lang.split('|').includes('en'),
      }
    })
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
          const font = fontkit.create(await fs.promises.readFile(file)) as unknown as {
            familyName?: string
            subfamilyName?: string
            getName?: (key: string) => string | null
            'OS/2'?: { usWeightClass?: number; usWidthClass?: number }
            variationAxes?: Record<string, unknown>
          }
          if (font.variationAxes && Object.keys(font.variationAxes).length) continue
          const sub = font.subfamilyName ?? ''
          const os2 = font['OS/2']
          // Nom de famille typographique (« Inter ») avant le nom hérité (« Inter SemiBold »)
          const names = [...new Set([font.getName?.('preferredFamily'), font.familyName].filter((n): n is string => !!n))]
          if (!names.length) continue
          fonts.push({
            file,
            names,
            families: names.map(normalize),
            weight: os2?.usWeightClass ?? (/bold/i.test(sub) ? 700 : 400),
            italic: /italic|oblique/i.test(sub),
            width: ((os2?.usWidthClass ?? 5) / 5) * 100,
            latin: true,
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

const readFont = async (f: InstalledFont): Promise<FoundFont | null> => {
  try {
    return { file: f.file, family: f.names[0], data: new Uint8Array(await fs.promises.readFile(f.file)) }
  } catch {
    return null
  }
}

// Écart de style : la graisse exacte d'abord (400 ou 700), puis l'inclinaison, puis la chasse
const styleScore = (f: InstalledFont, bold: boolean, italic: boolean) =>
  Math.abs(f.weight - (bold ? 700 : 400)) / 100 + (f.italic === italic ? 0 : 3) + Math.abs(f.width - 100) / 50

// Police d'un PDF : seulement si la variante demandée existe vraiment
export async function findFont(pdfFontName: string, bold: boolean, italic: boolean): Promise<FoundFont | null> {
  const wanted = familyOf(pdfFontName)
  if (wanted.length < 3) return null
  const names = [wanted, ALIASES[wanted]].filter(Boolean)
  const best = (await installedFonts())
    .map((f) => {
      // Nom principal exact > nom secondaire ; puis bon style, chasse normale
      const rank = names.includes(f.families[0]) ? 0 : f.families.some((n) => names.includes(n)) ? 1 : -1
      return rank < 0 ? null : { f, score: rank * 100 + styleScore(f, bold, italic) }
    })
    .filter((c): c is { f: InstalledFont; score: number } => c !== null)
    .sort((a, b) => a.score - b.score)[0]
  // Un style trop éloigné (gras demandé, seul le normal existe…) fausserait le rendu
  if (!best || isBold(best.f.weight) !== bold || best.f.italic !== italic) return null
  return readFont(best.f)
}

const hidden = (name: string) => name.startsWith('.') || /emoji/i.test(name)

// Familles proposées dans le sélecteur de police
export async function listFamilies(): Promise<FontFamily[]> {
  const families = new Map<string, FontFamily>()
  for (const f of await installedFonts()) {
    const family = f.names[0]
    if (!family || hidden(family)) continue
    const entry = families.get(family) ?? { family, latin: true, bold: false, italic: false }
    // Les polices de symboles annoncent parfois l'anglais sur une partie de leurs fichiers seulement
    if (!f.latin) entry.latin = false
    if (isBold(f.weight)) entry.bold = true
    if (f.italic) entry.italic = true
    families.set(family, entry)
  }
  return [...families.values()].sort((a, b) => a.family.localeCompare(b.family))
}

// Police choisie dans le sélecteur : la variante la plus proche du style demandé
export async function findFamily(family: string, bold: boolean, italic: boolean): Promise<FoundFont | null> {
  const fonts = await installedFonts()
  const exact = fonts.filter((f) => f.names[0] === family)
  const pool = exact.length ? exact : fonts.filter((f) => f.families.includes(normalize(family)))
  const best = pool.sort((a, b) => styleScore(a, bold, italic) - styleScore(b, bold, italic))[0]
  return best ? readFont(best) : null
}
