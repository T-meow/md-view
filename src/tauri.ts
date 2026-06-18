import { invoke } from '@tauri-apps/api/core';
import type { DraftContent, DraftSummary, FileNode, Heading, OpenPathResult, ReadFileResult, SaveResult } from './types';

export function openWorkspace(path: string): Promise<FileNode> {
  return invoke('open_workspace', { path });
}

export function openPath(path: string): Promise<OpenPathResult> {
  return invoke('open_path', { path });
}

export function readFile(path: string): Promise<ReadFileResult> {
  return invoke('read_file', { path });
}

export function saveFile(path: string, content: string, expected: number | null, overwrite: boolean): Promise<SaveResult> {
  return invoke('save_file', { path, content, expected, overwrite });
}

export function extractOutline(content: string): Promise<Heading[]> {
  return invoke('extract_outline', { content });
}

export function writeDraft(path: string, content: string): Promise<DraftSummary> {
  return invoke('write_draft', { path, content });
}

export function readDraft(path: string): Promise<DraftContent | null> {
  return invoke('read_draft', { path });
}

export function deleteDraft(path: string): Promise<boolean> {
  return invoke('delete_draft', { path });
}

export function listDrafts(workspace: string): Promise<DraftSummary[]> {
  return invoke('list_drafts', { workspace });
}

export function clearWorkspaceDrafts(workspace: string): Promise<number> {
  return invoke('clear_workspace_drafts', { workspace });
}

export function initialOpenPaths(): Promise<string[]> {
  return invoke('initial_open_paths');
}

export function openDefaultAppSettings(): Promise<void> {
  return invoke('open_default_app_settings');
}
