const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

/**
 * Escapes the three characters Telegram's HTML parser treats as markup.
 *
 * Anything the app did not write itself — a calendar title, a stored message,
 * a Whisper transcript — has to pass through here before it is interpolated
 * into a message sent with `parse_mode: 'HTML'`. An unescaped `&` or `<` is
 * not a cosmetic problem: Telegram answers 400 and the message is never
 * delivered.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Converts Markdown links [text](url) to HTML <a> tags and escapes the rest.
 * Use with parse_mode: 'HTML' when sending Telegram messages.
 */
export function renderHtml(text: string): string {
  let result = '';
  let lastIndex = 0;

  for (const match of text.matchAll(LINK_RE)) {
    result += escapeHtml(text.slice(lastIndex, match.index));
    result += `<a href="${escapeHtml(match[2])}">${escapeHtml(match[1])}</a>`;
    lastIndex = match.index! + match[0].length;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}
