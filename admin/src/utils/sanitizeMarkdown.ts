import DOMPurify from 'dompurify';
import { marked } from 'marked';

export function sanitizeAdminHtml(html: string): string {
  return DOMPurify.sanitize(html || '', {
    USE_PROFILES: { html: true },
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math'],
  });
}

export function renderSafeMarkdown(content: string): string {
  const html = marked.parse(content || '', {
    async: false,
    gfm: true,
    pedantic: false,
  }) as string;

  return sanitizeAdminHtml(html);
}

export function sanitizeSvgContent(svgText: string): string {
  const cleaned = DOMPurify.sanitize(svgText || '', {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'style'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });

  if (!cleaned) return '';

  let result = cleaned;
  if (!result.includes('width=') && !result.includes('height=')) {
    result = result.replace('<svg', '<svg width="24" height="24"');
  }

  return result;
}
