import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from './sanitize'

describe('sanitizeHtml', () => {
  describe('script tag stripping', () => {
    it('removes a simple script tag', () => {
      expect(sanitizeHtml('<script>alert(1)</script>')).toBe('')
    })

    it('removes script tag with type attribute', () => {
      expect(sanitizeHtml('<script type="text/javascript">evil()</script>')).toBe('')
    })

    it('removes multiline script content', () => {
      const input = '<script>\nvar x = 1;\nalert(x);\n</script>'
      expect(sanitizeHtml(input)).toBe('')
    })

    it('removes script tag case-insensitively', () => {
      expect(sanitizeHtml('<SCRIPT>alert(1)</SCRIPT>')).toBe('')
      expect(sanitizeHtml('<Script>evil()</Script>')).toBe('')
    })

    it('removes multiple script tags', () => {
      const input = '<p>safe</p><script>bad1()</script><p>also safe</p><script>bad2()</script>'
      expect(sanitizeHtml(input)).toBe('<p>safe</p><p>also safe</p>')
    })

    it('preserves surrounding text when removing script', () => {
      expect(sanitizeHtml('before<script>evil()</script>after')).toBe('beforeafter')
    })
  })

  describe('event handler stripping', () => {
    it('removes double-quoted onclick handler', () => {
      expect(sanitizeHtml('<button onclick="evil()">click</button>')).toBe('<button >click</button>')
    })

    it('removes single-quoted onclick handler', () => {
      expect(sanitizeHtml("<button onclick='evil()'>click</button>")).toBe('<button >click</button>')
    })

    it('removes onmouseover handler', () => {
      expect(sanitizeHtml('<div onmouseover="hack()">hover</div>')).toBe('<div >hover</div>')
    })

    it('removes onerror handler', () => {
      expect(sanitizeHtml('<img src="x" onerror="evil()">')).toBe('<img src="x" >')
    })

    it('removes onload handler', () => {
      expect(sanitizeHtml('<body onload="init()">content</body>')).toBe('<body >content</body>')
    })

    it('removes event handler with spaces around =', () => {
      expect(sanitizeHtml('<div onclick = "evil()">text</div>')).toBe('<div >text</div>')
    })

    it('removes unquoted event handlers', () => {
      const result = sanitizeHtml('<div onclick=evil()>text</div>')
      expect(result).not.toContain('onclick')
    })
  })

  describe('javascript: protocol stripping', () => {
    it('removes javascript: in href', () => {
      expect(sanitizeHtml('<a href="javascript:alert(1)">click</a>')).toBe('<a href="alert(1)">click</a>')
    })

    it('removes javascript: case-insensitively', () => {
      expect(sanitizeHtml('<a href="JAVASCRIPT:alert(1)">click</a>')).toBe('<a href="alert(1)">click</a>')
    })

    it('removes mixed-case javascript:', () => {
      expect(sanitizeHtml('<a href="JavaScript:evil()">link</a>')).toBe('<a href="evil()">link</a>')
    })
  })

  describe('safe content preservation', () => {
    it('leaves plain text unchanged', () => {
      expect(sanitizeHtml('Hello, world!')).toBe('Hello, world!')
    })

    it('leaves normal HTML unchanged', () => {
      const html = '<p>This is <strong>bold</strong> text.</p>'
      expect(sanitizeHtml(html)).toBe(html)
    })

    it('leaves anchor tags with safe hrefs unchanged', () => {
      const html = '<a href="https://github.com">GitHub</a>'
      expect(sanitizeHtml(html)).toBe(html)
    })

    it('leaves img tags with safe src unchanged', () => {
      const html = '<img src="https://example.com/img.png" alt="image">'
      expect(sanitizeHtml(html)).toBe(html)
    })

    it('handles empty string', () => {
      expect(sanitizeHtml('')).toBe('')
    })

    it('preserves markdown-rendered code blocks', () => {
      const html = '<pre><code>const x = 1;</code></pre>'
      expect(sanitizeHtml(html)).toBe(html)
    })

    it('preserves headings and paragraphs', () => {
      const html = '<h1>Title</h1><p>Body text with <em>emphasis</em>.</p>'
      expect(sanitizeHtml(html)).toBe(html)
    })
  })

  describe('combined attack vectors', () => {
    it('strips both script and event handlers from same input', () => {
      const input = '<div onclick="evil()"><script>also_evil()</script>text</div>'
      const result = sanitizeHtml(input)
      expect(result).not.toContain('onclick')
      expect(result).not.toContain('<script>')
      expect(result).toContain('text')
    })

    it('strips javascript: from multiple locations', () => {
      const input = '<a href="javascript:a()">1</a><a href="javascript:b()">2</a>'
      const result = sanitizeHtml(input)
      expect(result).not.toContain('javascript:')
    })
  })
})
