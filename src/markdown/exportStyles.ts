import katexCss from 'katex/dist/katex.min.css?raw';
import katexLicense from '../../node_modules/katex/LICENSE?raw';

const fonts = import.meta.glob<string>('/node_modules/katex/dist/fonts/*.woff2', {
  query: '?inline',
  import: 'default',
  eager: true
});

export function mathExportStyles() {
  const css = katexCss.replace(/src:([^;}]+)/g, (declaration, sources: string) => {
    const name = sources.match(/url\(fonts\/([^()]+\.woff2)\)/)?.[1];
    const font = Object.entries(fonts).find(([path]) => path.endsWith(`/${name}`))?.[1];
    if (!font?.startsWith('data:')) throw new Error('Cannot embed a KaTeX export font.');
    return `src:url("${font}") format("woff2")`;
  });
  return `/* ${katexLicense.replace(/\*\//g, '* /')} */\n${css}`;
}
