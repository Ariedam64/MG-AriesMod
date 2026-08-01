// Simple markdown-to-HTML renderer for tool descriptions
// Supports: paragraphs, **bold**, *italic*, `code`, [text](url), and - bullet lists

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderInlineMarkdown(text: string): string {
  let html = text;

  // Code blocks (backticks) - do first to avoid processing inside code
  html = html.replace(/`([^`]+)`/g, '<code style="background:#ffffff0a;border:1px solid #ffffff18;border-radius:4px;padding:2px 6px;font-family:monospace;font-size:0.9em">$1</code>');

  // Links [text](url) - sanitize URL to http/https only
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return text; // Skip non-http(s) links
    }
    return `<a href="${escapeHtml(trimmed)}" target="_blank" rel="noopener noreferrer" style="color:#2d8cff;text-decoration:underline;cursor:pointer">${escapeHtml(text)}</a>`;
  });

  // Bold **text**
  html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong style="font-weight:700;color:#e7eef7">$1</strong>');

  // Italic *text* (must be after bold to avoid conflicts)
  html = html.replace(/\*([^\*]+)\*/g, '<em style="font-style:italic;opacity:0.95">$1</em>');

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
      const lines = trimmed.split('\n');
      const listItems = lines
        .filter((line) => line.trim().startsWith('- '))
        .map((line) => {
          const text = line.replace(/^-\s*/, '').trim();
          return `<li>${renderInlineMarkdown(text)}</li>`;
        });
      return `<ul style="margin:0;padding-left:20px;list-style:disc">${listItems.join('')}</ul>`;
    }

    // Normal paragraph
    return `<p style="margin:0 0 12px 0;line-height:1.5">${renderInlineMarkdown(trimmed)}</p>`;
  });

  return rendered.join('');
}
