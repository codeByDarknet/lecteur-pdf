// Coordonnées en unités de page (viewport pdf.js à l'échelle 1, origine en haut à gauche) :
// elles ne dépendent ni du zoom ni de la rotation affichée.

export type EditMode = 'annotate' | 'ultra'

export type EditTool =
  | 'select'
  | 'highlight'
  | 'underline'
  | 'strike'
  | 'text'
  | 'ink'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'image'
  | 'edit-text'
  | 'whiteout'

export type FontKey = 'helvetica' | 'times' | 'courier'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface BaseObject {
  id: string
  page: number
}

export interface MarkupObject extends BaseObject {
  type: 'markup'
  kind: 'highlight' | 'underline' | 'strike'
  rects: Rect[]
  color: string
}

export interface TextObject extends BaseObject {
  type: 'text'
  x: number
  y: number
  text: string
  fontSize: number
  font: FontKey
  bold: boolean
  italic: boolean
  color: string
  // Texte d'origine remplacé en mode édition ultra : id du cache qui masque l'ancien texte
  coverId?: string
  // Étirement horizontal qui redonne au texte la largeur qu'il avait dans la police d'origine
  scaleX?: number
  // Police installée (reprise du PDF d'origine ou choisie, voir systemFonts) ; à défaut, la police standard `font`
  systemFont?: string
}

export interface InkObject extends BaseObject {
  type: 'ink'
  points: Array<[number, number]>
  color: string
  width: number
}

export interface ShapeObject extends BaseObject {
  type: 'shape'
  kind: 'rect' | 'ellipse' | 'line' | 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  width: number
}

export interface ImageObject extends BaseObject {
  type: 'image'
  x: number
  y: number
  w: number
  h: number
  src: string
}

// Rectangle opaque de la couleur du fond : efface le contenu d'origine en dessous
export interface CoverObject extends BaseObject {
  type: 'cover'
  x: number
  y: number
  w: number
  h: number
  color: string
  // Clé de la ligne de texte d'origine masquée (mode édition ultra)
  sourceKey?: string
}

export type EditObject = MarkupObject | TextObject | InkObject | ShapeObject | ImageObject | CoverObject

export interface EditStyle {
  color: string
  markColor: string
  strokeWidth: number
  fontSize: number
  font: FontKey
  systemFont?: string
  bold: boolean
  italic: boolean
}
