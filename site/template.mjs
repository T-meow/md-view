const repo = 'https://github.com/T-meow/md-view';
const release = `${repo}/releases/latest`;
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const logo =
  '<svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 6h8l3 3 3-3h8v21h-8l-3 2-3-2H5V6Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M16 10v18M9 12h3M9 17h3M20 12h3M20 17h3" stroke="currentColor" stroke-width="1.4"/></svg>';
export function renderPage(c, locale, base, version) {
  const origin = 'https://t-meow.github.io';
  const url = `${origin}${base}${locale === 'en' ? 'en/' : ''}`;
  const alternate = `${base}${locale === 'en' ? '' : 'en/'}`;
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'md-view',
    softwareVersion: version,
    applicationCategory: 'ProductivityApplication',
    operatingSystem: 'Windows, macOS',
    url: `${origin}${base}`,
    description: c.description,
    downloadUrl: release
  });
  return `<!doctype html>
<html lang="${c.lang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">
<title>${escape(c.title)}</title><meta name="description" content="${escape(c.description)}"><link rel="canonical" href="${url}">
<link rel="alternate" hreflang="zh-CN" href="${origin}${base}"><link rel="alternate" hreflang="en" href="${origin}${base}en/"><link rel="alternate" hreflang="x-default" href="${origin}${base}">
<meta property="og:type" content="website"><meta property="og:title" content="${escape(c.title)}"><meta property="og:description" content="${escape(c.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${origin}${base}preview.png"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${base}favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${base}styles.css"><script type="module" src="${base}site.js"></script><script type="application/ld+json">${json}</script></head>
<body><a class="skip" href="#main">${c.skip}</a>
<header class="site-header wrap"><a class="brand" href="${base}">${logo}<span>md-view<span class="brand-period">.</span></span></a><button class="menu-toggle" aria-label="${c.menu}" aria-expanded="false" aria-controls="navigation">☰</button><nav id="navigation" aria-label="Navigation"><a href="#features">${c.nav[0]}</a><a href="#editions">${c.nav[1]}</a><a href="#faq">${c.nav[2]}</a><a href="${alternate}" lang="${locale === 'en' ? 'zh-CN' : 'en'}">${c.switchLanguage}</a><button class="theme-toggle" aria-label="${c.theme}" title="${c.theme}">◐</button><a class="nav-download" href="${release}">${c.download} <span aria-hidden="true">↗</span></a></nav></header>
<main id="main">
<section class="hero wrap"><div class="hero-copy"><p class="eyebrow"><span></span>${c.eyebrow}</p><h1>${c.headline}</h1><p class="intro">${c.intro}</p><div class="hero-actions"><a class="button primary" href="${release}">${c.download}<span aria-hidden="true">↗</span></a><a class="button secondary" href="${base}play/">${c.try}<span aria-hidden="true">→</span></a><a class="hero-github" href="${repo}">GitHub ↗</a></div><p class="platforms">v${escape(version)} · ${c.platforms}</p></div><div class="hero-note" aria-hidden="true"><span>README.md</span><p># Hello, words.</p><span class="note-cursor"></span><small>plain text. clear thoughts.</small></div></section>
<figure class="product wrap"><div class="product-window" aria-hidden="true"><div class="window-title"><span class="window-dots">● ● ●</span><span>README.md — md-view</span><span class="window-controls">− □ ×</span></div><div class="mock-toolbar"><span>${logo}<b>md-view</b></span><span class="mock-modes">${c.modes.map((label, i) => `<span class="${i === 0 ? 'chosen' : ''}">${label}</span>`).join('')}</span><span>☷</span></div><div class="mock-workspace"><aside><small>${c.filePanel}</small><span class="mock-file">▤ README.md</span><span>▤ notes.md</span><span>▤ ideas.md</span><div class="mock-folder-note">Markdown<br>made comfortable.</div></aside><article class="mock-page"><small class="document-label">THE EVERYDAY NOTE</small><h2>${c.sampleTitle}</h2><p class="mock-lede">${c.sampleText}</p><hr><h3>${c.sampleSub}</h3><p>${c.sampleBody}</p><blockquote>${c.sampleQuote}</blockquote><pre><code>${escape(c.sampleCode)}</code></pre></article><aside class="mock-outline"><small>${c.outline}</small><span>${c.sampleTitle}</span><span>${c.sampleSub}</span><span>Markdown</span></aside></div><div class="mock-status"><span>UTF-8</span><span>Markdown · 100%</span></div></div><figcaption>${c.caption}</figcaption></figure>
<section class="features wrap" id="features"><div class="section-heading"><p class="eyebrow">MADE FOR THE EVERYDAY</p><h2>${c.featuresTitle}</h2><p>${c.featuresIntro}</p></div><div class="feature-list">${c.features.map(([number, title, description]) => `<article><span>${number}</span><div><h3>${title}</h3><p>${description}</p></div></article>`).join('')}</div></section>
<section class="editions" id="editions"><div class="wrap"><p class="eyebrow">ONE APP. TWO EDITIONS.</p><h2>${c.editionsTitle}</h2><p class="section-intro">${c.editionsIntro}</p><div class="edition-cards"><article><p class="eyebrow">${c.liteTag}</p><h3>Lite<span>↙</span></h3><p>${c.lite}</p></article><article class="plus"><p class="eyebrow">${c.plusTag}</p><h3>Plus<span>＋</span></h3><p>${c.plus}</p></article></div><div class="comparison"><table><thead><tr>${c.tableHeading.map((t) => `<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${c.comparison.map((row) => `<tr><th scope="row">${row[0]}</th><td>${row[1]}</td><td>${row[2]}</td></tr>`).join('')}</tbody></table></div></div></section>
<section class="steps wrap"><p class="eyebrow">OPEN. READ. WRITE.</p><h2>${c.stepsTitle}</h2><ol>${c.steps.map(([title, body], i) => `<li><span>0${i + 1}</span><h3>${title}</h3><p>${body}</p></li>`).join('')}</ol></section>
<section class="download wrap" id="download"><div><p class="eyebrow">A PLACE FOR YOUR WORDS</p><h2>${c.downloadTitle}</h2></div><div><p>${c.downloadIntro}</p><a class="button primary" href="${release}">${c.download}<span aria-hidden="true">↗</span></a><a class="source-link" href="${repo}">${c.source} →</a><small>${c.releaseNote}</small></div></section>
<section class="faq wrap" id="faq"><h2>${c.faqTitle}</h2><div>${c.faqs.map(([question, answer]) => `<details><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div></section>
</main><footer class="site-footer wrap"><div><a class="brand" href="${base}">${logo}<span>md-view.</span></a><p>${c.footer}</p></div><div><a href="${repo}">GitHub ↗</a><a href="${repo}/issues">${c.issue}</a><a href="${repo}/blob/main/LICENSE">${c.license}</a><span>WTFPL · Open source</span></div></footer></body></html>`;
}
