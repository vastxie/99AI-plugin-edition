import DOMPurify from 'dompurify'

const URL_ATTRS = ['href', 'xlink:href', 'src', 'action', 'formaction']
const LINK_ATTRS = ['href', 'xlink:href']

function parseUrl(value: string): URL | null {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://localhost'
    return new URL(value, base)
  } catch {
    return null
  }
}

function isSafeLinkUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return true
  const parsed = parseUrl(trimmed)
  return !!parsed && ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)
}

function isSafeResourceUrl(value: string): boolean {
  const parsed = parseUrl(value.trim())
  return !!parsed && ['http:', 'https:', 'blob:'].includes(parsed.protocol)
}

DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (!(node instanceof Element)) return

  for (const attr of URL_ATTRS) {
    const value = node.getAttribute(attr)
    if (!value) continue
    const isSafe = LINK_ATTRS.includes(attr) ? isSafeLinkUrl(value) : isSafeResourceUrl(value)
    if (!isSafe) {
      node.removeAttribute(attr)
    }
  }

  if (node.tagName.toLowerCase() === 'a' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export function sanitizeMarkdownHtml(html: string): string {
  return DOMPurify.sanitize(html || '', {
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target', 'rel', 'data-block-id', 'aria-label', 'role'],
    FORBID_ATTR: ['srcdoc'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'],
  })
}

export function sanitizeSvgContent(svgText: string): string {
  const cleaned = DOMPurify.sanitize(svgText || '', {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'style'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  })

  if (!cleaned) return ''

  let result = cleaned
  if (!result.includes('viewBox')) {
    result = result.replace('<svg', '<svg viewBox="0 0 24 24"')
  }
  if (!result.includes('width=') || !result.includes('height=')) {
    result = result.replace('<svg', '<svg width="100%" height="100%"')
  }

  return result
}
