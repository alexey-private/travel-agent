import { renderHtml } from '../src/render';

describe('renderHtml', () => {
  it('escapes & < > characters in plain text', () => {
    expect(renderHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('converts a single markdown link to an <a> tag', () => {
    const result = renderHtml('Visit [Google](https://google.com) now');
    expect(result).toBe('Visit <a href="https://google.com">Google</a> now');
  });

  it('converts multiple markdown links in the same string', () => {
    const result = renderHtml('[A](https://a.com) and [B](https://b.com)');
    expect(result).toBe('<a href="https://a.com">A</a> and <a href="https://b.com">B</a>');
  });

  it('escapes HTML in the text surrounding a link', () => {
    const result = renderHtml('<b>See</b> [here](https://example.com)');
    expect(result).toBe('&lt;b&gt;See&lt;/b&gt; <a href="https://example.com">here</a>');
  });

  it('escapes special chars in the link text', () => {
    const result = renderHtml('[A & B](https://example.com)');
    expect(result).toBe('<a href="https://example.com">A &amp; B</a>');
  });

  it('returns empty string for empty input', () => {
    expect(renderHtml('')).toBe('');
  });

  it('returns plain text unchanged when there are no links', () => {
    expect(renderHtml('Hello World')).toBe('Hello World');
  });

  it('ignores non-http links (relative or mailto)', () => {
    // LINK_RE requires https?:// so these should be treated as plain text
    const result = renderHtml('[Docs](/docs) and [Mail](mailto:x@y.com)');
    expect(result).toBe('[Docs](/docs) and [Mail](mailto:x@y.com)');
  });
});
