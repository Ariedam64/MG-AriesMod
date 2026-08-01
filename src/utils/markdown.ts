// Simple markdown-to-HTML renderer for tool descriptions
// Supports: paragraphs, **bold**, *italic*, `code`, [text](url), and - bullet lists
//
// The output carries no styling of its own — callers wrap it in a container
// that styles the tags (see `.mgt-md` in ui/menus/tools/styles.ts).

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderInlineMarkdown(text: string): string {
  let html = text;

  // Code blocks (backticks) - do first to avoid processing inside code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links [text](url) - sanitize URL to http/https only
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return label; // Skip non-http(s) links
    }
    return `<a href="${escapeHtml(trimmed)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  });

  // Bold **text**
  html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');

  // Italic *text* (must be after bold to avoid conflicts)
  html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');

  return html;
}

export function renderMarkdown(source: string): string {
  const escaped = escapeHtml(source);

  // Split by blank lines to get paragraphs
  const blocks = escaped.split(/\n\s*\n/);
  const rendered = blocks.map((block) => {
    const trimmed = block.trim();

    // Bullet list
    if (trimmed.startsWith('- ')) {
      const listItems = trimmed
        .split('\n')
        .filter((line) => line.trim().startsWith('- '))
        .map((line) => `<li>${renderInlineMarkdown(line.replace(/^-\s*/, '').trim())}</li>`);
      return `<ul>${listItems.join('')}</ul>`;
    }

    // Normal paragraph
    return `<p>${renderInlineMarkdown(trimmed)}</p>`;
  });

  return rendered.join('');
}

/** Plain-text preview of a markdown source, for list card summaries. */
export function markdownToPlainText(source: string): string {
  return source
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^\*]+)\*\*/g, '$1')
    .replace(/\*([^\*]+)\*/g, '$1')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
