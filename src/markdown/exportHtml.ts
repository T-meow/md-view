import { toImageAssetSrc } from '../fileAssets';
import highlightCss from 'highlight.js/styles/github.css?raw';
import highlightLicense from '../../node_modules/highlight.js/LICENSE?raw';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export type HtmlExportOptions = {
  html: string;
  title: string;
  language: string;
  markdownPath: string;
};
type ImageLoader = (url: string) => Promise<string>;

export async function createExportHtml(
  { html, title, language, markdownPath }: HtmlExportOptions,
  loadImage: ImageLoader = embedImage
) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const root = template.content;

  // Toolbars depend on application event handlers and have no exported action.
  root
    .querySelectorAll('button, form, script, input:not([type="checkbox"])')
    .forEach((node) => node.remove());
  root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((node) => {
    node.disabled = true;
  });
  root.querySelectorAll('source[srcset]').forEach((node) => node.remove());
  const images = new Map<string, Promise<string>>();
  for (const image of root.querySelectorAll('img')) {
    image.removeAttribute('srcset');
    const source = image.getAttribute('data-source-src') ?? image.getAttribute('src') ?? '';
    const asset = toImageAssetSrc(source, markdownPath);
    if (isAppAsset(asset) || asset.startsWith('blob:')) {
      let data = images.get(asset);
      if (!data) {
        data = loadImage(asset);
        images.set(asset, data);
      }
      image.setAttribute('src', await data);
    } else {
      image.setAttribute('src', source);
    }
  }

  for (const link of root.querySelectorAll('a, area')) {
    const source = link.getAttribute('data-source-href') ?? link.getAttribute('href') ?? '';
    if (link.hasAttribute('data-local-file')) {
      // Relative document links remain usable when companion documents are
      // distributed alongside the HTML. Never publish machine-specific paths.
      if (isRelativeDocumentLink(source)) link.setAttribute('href', source);
      else {
        link.removeAttribute('href');
        link.setAttribute('aria-disabled', 'true');
      }
    }
  }
  for (const node of root.querySelectorAll('*')) {
    for (const attribute of Array.from(node.attributes)) {
      if (/^data-(?:source-|local-|outline-|code-|mermaid-)/.test(attribute.name)) {
        node.removeAttribute(attribute.name);
      }
    }
  }

  const mathStyles = root.querySelector('.katex')
    ? (await import('./exportStyles')).mathExportStyles()
    : '';
  const styles =
    `/* ${highlightLicense.replace(/\*\//g, '* /')} */\n${highlightCss}\n${mathStyles}\n` +
    'body{font:16px/1.75 system-ui,sans-serif;max-width:920px;margin:40px auto;padding:0 24px;color:#243330}' +
    'img,svg{max-width:100%}pre{overflow:auto;padding:16px;background:#f2f5f4}code{font-family:ui-monospace,monospace}' +
    'table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #ccd7d3;padding:8px}' +
    'blockquote{border-left:3px solid #91aaa1;padding-left:16px}' +
    '.markdown-code-tools,.markdown-mermaid-tools{display:none}.katex-display{overflow-x:auto;overflow-y:hidden}';
  return `<!doctype html><html lang="${escapeHtml(language)}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; font-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><title>${escapeHtml(title)}</title><style>${styles.replace(/<\/style/gi, '<\\/style')}</style></head><body><article>${template.innerHTML}</article></body></html>`;
}

function isAppAsset(source: string) {
  if (source.startsWith('asset:')) return true;
  try {
    return new URL(source).hostname === 'asset.localhost';
  } catch {
    return false;
  }
}

function isRelativeDocumentLink(source: string) {
  let decoded = source;
  try {
    decoded = decodeURIComponent(source);
  } catch {
    /* Keep literal percent signs. */
  }
  return Boolean(decoded) && !/^(?:[a-z][a-z\d+.-]*:|[\\/])|[\u0000-\u001f\u007f]/i.test(decoded);
}

async function embedImage(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('无法读取导出图片 / Cannot read an image for HTML export.');
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
    throw new Error('导出图片不能超过 20 MiB / Export images must be at most 20 MiB.');
  }
  const blob = await response.blob();
  if (blob.size > MAX_IMAGE_BYTES)
    throw new Error('导出图片不能超过 20 MiB / Export images must be at most 20 MiB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('无法嵌入导出图片 / Cannot embed an export image.'));
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
  );
}
