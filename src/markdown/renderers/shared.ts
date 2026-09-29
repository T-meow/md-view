import DOMPurify from 'dompurify';
import { resolveLocalPath, toImageAssetSrc } from '../../fileAssets';
import type { Heading, LinkValidationRequest } from '../../types';

const SAFE_EXTRA_TAGS = [
  'button',
  'details',
  'summary',
  'input',
  'mark',
  'ins',
  'sub',
  'sup',
  'kbd',
  'dl',
  'dt',
  'dd',
  'nav',
  'section'
];
const SAFE_BASE_ATTRIBUTES = [
  'align',
  'class',
  'data-local-file',
  'data-outline-line',
  'id',
  'name',
  'target',
  'title',
  'style'
];

export type MarkdownRenderContext = {
  headings: Heading[];
  markdownPath: string;
  linkTargets?: LinkValidationRequest[];
};

export type MarkdownRenderResult = {
  html: string;
  status: string;
  linkTargets?: LinkValidationRequest[];
};

export function postProcessMarkdownHtml(
  raw: string,
  context: MarkdownRenderContext,
  extraAllowedAttrs: string[] = []
) {
  const template = document.createElement('template');
  template.innerHTML = raw;

  const images = template.content.querySelectorAll('img');
  images.forEach((node) => {
    const source = node.getAttribute('src');
    if (source) {
      context.linkTargets?.push({ href: source, kind: 'image' });
      node.setAttribute('data-source-src', source);
    }
    const nextSource = toImageAssetSrc(source, context.markdownPath);
    if (nextSource) {
      node.setAttribute('src', nextSource);
    }
  });

  const links = template.content.querySelectorAll('a[href]');
  links.forEach((node) => {
    const href = (node.getAttribute('href') ?? '').trim();
    context.linkTargets?.push({ href, kind: 'link' });
    if (isExternalHref(href)) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
      return;
    }
    if (href.startsWith('#')) {
      node.setAttribute('data-local-anchor', href.slice(1));
      return;
    }
    const localPath = resolveLocalPath(href, context.markdownPath);
    if (!localPath) return;
    node.setAttribute('href', '#');
    node.setAttribute('data-local-file', localPath);
    node.setAttribute('data-source-href', href);
  });

  const renderedHeadings = template.content.querySelectorAll('h1,h2,h3,h4,h5,h6');
  const usedIds = new Set(context.headings.map((heading) => heading.anchor));
  const slugCounts = new Map<string, number>();
  renderedHeadings.forEach((node, index) => {
    const heading = context.headings[index];
    if (!heading) return;
    node.setAttribute('id', stableHeadingId(heading, index));
    node.setAttribute('data-outline-line', String(heading.line));
    const base = slugHeading(heading.text, index).replace(/^heading-/, '');
    const count = slugCounts.get(base) || 0;
    slugCounts.set(base, count + 1);
    const slug = count ? `${base}-${count}` : base;
    for (const id of [slug, `heading-${slug}`]) {
      if (usedIds.has(id)) continue;
      usedIds.add(id);
      const alias = document.createElement('span');
      alias.id = id;
      alias.setAttribute('aria-hidden', 'true');
      node.prepend(alias);
    }
  });

  return DOMPurify.sanitize(template.innerHTML, {
    ADD_TAGS: SAFE_EXTRA_TAGS,
    ADD_ATTR: [
      ...SAFE_BASE_ATTRIBUTES,
      'data-local-anchor',
      'data-source-href',
      'data-source-src',
      ...extraAllowedAttrs
    ],
    ADD_URI_SAFE_ATTR: ['src'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data|blob|asset):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  });
}

function stableHeadingId(heading: Heading, index: number) {
  return heading.anchor || slugHeading(heading.text, index);
}

function isExternalHref(href: string) {
  return /^(?:https?:|mailto:|tel:|\/\/)/i.test(href);
}

function slugHeading(text: string, index: number) {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return slug ? `heading-${slug}` : `heading-${index + 1}`;
}
