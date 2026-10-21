export type FileKind = 'directory' | 'file';

export type DiskRevision = { modified: string; size: number; hash: string };
export type DocumentFile = {
  id: string;
  path: string;
  content: string;
  encoding: string;
  bom: boolean;
  newline: string;
  revision: DiskRevision;
};
export type SaveRequest = {
  path: string;
  content: string;
  encoding: string;
  bom: boolean;
  newline: string;
  expected: DiskRevision | null;
};
export type SaveReply = {
  file: DocumentFile | null;
  code: 'conflict' | 'encoding' | null;
  message: string | null;
};
export type DirectoryEntry = { path: string; name: string; kind: FileKind; size: number };
export type DirectoryBatch = {
  request_id: string;
  path: string;
  entries: DirectoryEntry[];
  errors: string[];
  complete: boolean;
  version: string;
};
export type ScanBatch = {
  request_id: string;
  files: DirectoryEntry[];
  headings: WorkspaceHeading[];
  scanned: number;
  skipped: number;
  errors?: string[];
  elapsed_ms: number;
  complete: boolean;
  cancelled: boolean;
  incomplete: boolean;
  message: string | null;
};

export type Heading = {
  level: number;
  text: string;
  line: number;
  endLine?: number;
  anchor: string;
};

export type LinkValidationRequest = {
  href: string;
  kind: 'link' | 'image';
};

export type LinkValidationResult = {
  href: string;
  kind: 'link' | 'image';
  ok: boolean;
  target_path?: string;
  message?: string;
};

export type WorkspaceHeading = Heading & {
  path: string;
  file_name: string;
};

export type DraftContent = {
  path: string;
  content: string;
  updated_at: number;
  content_hash: string;
};

export type DraftSummary = {
  path: string;
  updated_at: number;
  content_hash: string;
};

export type ViewMode = 'read' | 'edit' | 'visual' | 'split';

export type ThemeMode = 'light' | 'dark';

export type ThemeTokens = {
  appBg: string;
  appText: string;
  panelBg: string;
  panelText: string;
  panelMuted: string;
  contentBg: string;
  contentOverlay: string;
  border: string;
  borderSoft: string;
  buttonBg: string;
  buttonHover: string;
  buttonText: string;
  primary: string;
  primaryHover: string;
  primaryText: string;
  selectedBg: string;
  selectedText: string;
  segmentedBg: string;
  activeBg: string;
  dirtyBg: string;
  dirtyText: string;
  muted: string;
  dot: string;
  editorBg: string;
  editorText: string;
  editorGutterBg: string;
  editorGutterText: string;
  editorCursor: string;
  editorSelection: string;
  editorLine: string;
  editorKeyword: string;
  editorHeading: string;
  editorLink: string;
  editorString: string;
  editorComment: string;
  editorCode: string;
  markdownText: string;
  markdownH1: string;
  markdownH2: string;
  markdownH3: string;
  markdownH4: string;
  markdownH5: string;
  markdownH6: string;
  markdownLink: string;
  markdownQuoteText: string;
  markdownQuoteBorder: string;
  markdownCodeBg: string;
  markdownCodeText: string;
  markdownPreBg: string;
  markdownTableHeaderBg: string;
  markdownRule: string;
  dropBg: string;
};

export type AppTheme = {
  id: string;
  name: string;
  mode: ThemeMode;
  accent: string;
  tokens: ThemeTokens;
};
