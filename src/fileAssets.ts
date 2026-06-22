import { convertFileSrc } from '@tauri-apps/api/core';

const EXTERNAL_SCHEME_PATTERN = /^(?:https?:|data:|blob:|asset:)/i;
const FILE_SCHEME_PATTERN = /^file:\/\//i;
const UNKNOWN_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const WINDOWS_ABSOLUTE_PATTERN = /^[a-zA-Z]:[\\/]/;
const UNC_ABSOLUTE_PATTERN = /^\\\\/;

export function toImageAssetSrc(source: string | null | undefined, markdownPath = '') {
  const rawSource = source?.trim();
  if (!rawSource || EXTERNAL_SCHEME_PATTERN.test(rawSource)) {
    return rawSource ?? '';
  }
  if (UNKNOWN_SCHEME_PATTERN.test(rawSource) && !FILE_SCHEME_PATTERN.test(rawSource) && !WINDOWS_ABSOLUTE_PATTERN.test(rawSource)) {
    return rawSource;
  }

  const resolvedPath = resolveLocalPath(rawSource, markdownPath);

  return resolvedPath ? convertFileSrc(resolvedPath) : rawSource;
}

export function resolveLocalPath(source: string | null | undefined, markdownPath = '') {
  const rawSource = source?.trim();
  if (!rawSource || EXTERNAL_SCHEME_PATTERN.test(rawSource)) {
    return '';
  }
  if (UNKNOWN_SCHEME_PATTERN.test(rawSource) && !FILE_SCHEME_PATTERN.test(rawSource) && !WINDOWS_ABSOLUTE_PATTERN.test(rawSource)) {
    return '';
  }

  const cleanSource = stripHashAndQuery(rawSource);
  const withoutFileScheme = FILE_SCHEME_PATTERN.test(cleanSource) ? fileUrlToPath(cleanSource) : cleanSource;
  return isAbsolutePath(withoutFileScheme) ? withoutFileScheme : resolveSiblingPath(markdownPath, withoutFileScheme);
}

export function isLocalMarkdownPath(path: string) {
  return /\.(?:md|markdown)$/i.test(stripHashAndQuery(path));
}

function resolveSiblingPath(baseFilePath: string, relativePath: string) {
  if (!baseFilePath) return '';
  const directory = parentDirectory(baseFilePath);
  if (!directory) return '';
  return normalizePath(`${directory}/${relativePath}`);
}

function parentDirectory(path: string) {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
}

function normalizePath(path: string) {
  const hasUncPrefix = path.startsWith('\\\\') || path.startsWith('//');
  const normalized = path.replace(/\\/g, '/');
  if (hasUncPrefix) {
    return `//${normalized.replace(/^\/+/, '').replace(/\/+/g, '/')}`;
  }
  return normalized.replace(/\/+/g, '/');
}

function isAbsolutePath(path: string) {
  return path.startsWith('/') || WINDOWS_ABSOLUTE_PATTERN.test(path) || UNC_ABSOLUTE_PATTERN.test(path);
}

function fileUrlToPath(source: string) {
  try {
    const url = new URL(source);
    const decoded = decodeURIComponent(url.pathname);
    if (url.hostname) {
      return `//${url.hostname}${decoded}`;
    }
    return decoded.replace(/^\/([a-zA-Z]:\/)/, '$1');
  } catch {
    return source.replace(FILE_SCHEME_PATTERN, '');
  }
}

function stripHashAndQuery(source: string) {
  return source.split(/[?#]/, 1)[0] ?? source;
}
