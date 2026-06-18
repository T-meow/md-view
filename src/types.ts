export type FileKind = 'directory' | 'file';

export type FileNode = {
  path: string;
  name: string;
  kind: FileKind;
  children: FileNode[];
  size: number;
  modified_at: number;
};

export type Heading = {
  level: number;
  text: string;
  line: number;
  anchor: string;
};

export type ReadFileResult = {
  path: string;
  content: string;
  encoding: string;
  modified_at: number;
};

export type OpenPathResult = {
  kind: 'workspace' | 'file';
  workspace_path?: string;
  file_path?: string;
  tree?: FileNode;
  file?: ReadFileResult;
};

export type SaveResult = {
  ok: boolean;
  conflict: boolean;
  modified_at?: number;
  message?: string;
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
