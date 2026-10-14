export interface PdfTab {
  id: string;
  filePath: string;
  fileName: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
}

export interface Panel {
  id: string;
  tabs: PdfTab[];
  activeTabId: string | null;
  showThumbnails: boolean;
}

export type SplitDirection = 'horizontal' | 'vertical';

export interface Highlight {
  id: string;
  tabId: string;
  pageIndex: number;
  color: string;
  text: string;
}

export interface SearchState {
  query: string;
  isOpen: boolean;
  currentMatch: number;
  totalMatches: number;
}

export interface SelectedPdfFile {
  filePath: string;
  fileName: string;
}

export interface ElectronAPI {
  openFileDialog: () => Promise<SelectedPdfFile[] | SelectedPdfFile | null>;
  readFile: (filePath: string) => Promise<ArrayBuffer>;
  saveFileDialog: (defaultPath: string) => Promise<string | null>;
  writeFile: (filePath: string, data: Uint8Array) => Promise<boolean>;
  findFont: (name: string, bold: boolean, italic: boolean) => Promise<{ file: string; data: Uint8Array } | null>;
  getPendingFiles: () => Promise<SelectedPdfFile[]>;
  onOpenFiles: (callback: (files: SelectedPdfFile[]) => void) => () => void;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

