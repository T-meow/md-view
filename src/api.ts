import { Channel, invoke } from '@tauri-apps/api/core';
import type {
  DirectoryBatch,
  DiskRevision,
  DocumentFile,
  DraftContent,
  DraftSummary,
  LinkValidationRequest,
  LinkValidationResult,
  SaveReply,
  SaveRequest,
  ScanBatch
} from './types';

export const openDocument = (path: string) => invoke<DocumentFile>('document_open', { path });
export const saveDocument = (request: SaveRequest) => invoke<SaveReply>('document_save', { request });
export const documentVersions = (paths: string[]) =>
  invoke<[string, DiskRevision | null][]>('document_versions', { paths });
export const pathKind = (path: string) => invoke<'file' | 'directory'>('path_kind', { path });
export const createFolder = (path: string) => invoke<string>('create_folder', { path });
export const movePath = (path: string, target: string) => invoke<string>('move_path', { path, target });
export const trashPath = (path: string) => invoke<void>('trash_path', { path });
export const revealPath = (path: string) => invoke<void>('reveal_path', { path });
export const cancelScan = (requestId: string) => invoke<void>('scan_cancel', { requestId });
export function loadDirectory(
  root: string,
  path: string,
  excludes: string[],
  requestId: string,
  onBatch: (batch: DirectoryBatch) => void
) {
  const channel = new Channel<DirectoryBatch>();
  channel.onmessage = onBatch;
  return invoke<void>('directory_load', { root, path, excludes, requestId, channel });
}
export function scanWorkspace(
  root: string,
  kind: 'files' | 'headings',
  excludes: string[],
  requestId: string,
  onBatch: (batch: ScanBatch) => void
) {
  const channel = new Channel<ScanBatch>();
  channel.onmessage = onBatch;
  return invoke<void>('workspace_scan', { root, kind, excludes, requestId, channel });
}
export const watchWorkspace = (paths: string[]) =>
  invoke<{ available: boolean; failed: string[] }>('workspace_watch', { paths });
export const writeDraft = (path: string, content: string) =>
  invoke<DraftSummary>('write_draft', { path, content });
export const readDraft = (path: string) => invoke<DraftContent | null>('read_draft', { path });
export const deleteDraft = (path: string) => invoke<boolean>('delete_draft', { path });
export const listDrafts = (workspace = '') => invoke<DraftSummary[]>('list_drafts', { workspace });
export const moveDraft = (from: string, to: string) => invoke<void>('move_draft', { from, to });
export const initialOpenPaths = () => invoke<string[]>('initial_open_paths');
export const openDefaultAppSettings = () => invoke<void>('open_default_app_settings');
export const openExternalUrl = (url: string) => invoke<void>('open_external_url', { url });
export const openLocalPath = (path: string) => invoke<void>('open_local_path', { path });
export const validateLocalLinks = (path: string, links: LinkValidationRequest[], anchors: string[] = []) =>
  invoke<LinkValidationResult[]>('validate_local_links', { markdownPath: path, links, anchors });
export const exportHtml = (path: string, html: string) => invoke<void>('export_html', { path, html });
