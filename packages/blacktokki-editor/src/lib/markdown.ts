import markdownIt from 'markdown-it';
import TurndownService from 'turndown';

const markdownToHtml = markdownIt();

markdownToHtml.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const code = token.content;
  let language = token.info || '';
  if (language === 'html') {
    language = 'markup';
  }
  let escapeCode: string = markdownToHtml.utils.escapeHtml(code);
  if (escapeCode.endsWith('\n')) {
    escapeCode = escapeCode.slice(0, escapeCode.length - 1);
  }
  // Create custom HTML for code blocks
  return `<pre class="language-${language}"><code>${escapeCode}</code></pre>`;
};

const renderStrong: typeof markdownToHtml.renderer.rules.strong_open = (
  tokens,
  idx,
  opts,
  _,
  slf
) => {
  const token = tokens[idx];
  if (token.markup === '__') {
    token.tag = 'u';
  }
  if (token.markup === '**') {
    token.tag = 'strong';
  }
  return slf.renderToken(tokens, idx, opts);
};

markdownToHtml.renderer.rules.strong_open = renderStrong;
markdownToHtml.renderer.rules.strong_close = renderStrong;

const HtmlToMarkdown = new TurndownService({
  preformattedCode: true,
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
});

HtmlToMarkdown.addRule('codeBlock', {
  filter(node, options) {
    // Determine if this node should be treated as a code block
    // For example, looking for <pre><code> combinations
    return (
      node.nodeName === 'PRE' && node.firstChild !== null && node.firstChild.nodeName === 'CODE'
    );
  },
  replacement(content, node, options) {
    // Get the language if specified (often in a class attribute)
    const language = (node as HTMLElement).getAttribute('class') || '';
    const languageMatch = language.match(/language-(\S+)/);
    let languageSpec = languageMatch ? languageMatch[1] : '';
    if (languageSpec === 'markup') {
      languageSpec = 'html';
    }
    if (languageSpec === 'none') {
      languageSpec = '';
    }
    // Get the code content and trim whitespace
    const code = (node.firstChild as HTMLElement).textContent || '';
    // Format as a code block with your preferred style
    // This example uses GitHub-style code fences with language specification
    return '\n\n```' + languageSpec + '\n' + code + '\n```\n\n';
  },
});
HtmlToMarkdown.addRule('underline', {
  filter: ['u'],
  replacement(content) {
    const trailingNewline = content.endsWith('\n') ? '  \n' : '';
    return '__' + content.trim() + '__' + trailingNewline;
  },
});
HtmlToMarkdown.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement(content) {
    const trailingNewline = content.endsWith('\n') ? '  \n' : '';
    return '~~' + content.trim() + '~~' + trailingNewline;
  },
});

// A function that renders markdown to HTML
export const renderer = (markdownCode: string) => {
  return markdownToHtml.render(markdownCode);
};

// A function that converts HTML back to Markdown
export const parser = (htmlCode: string) => {
  return HtmlToMarkdown.turndown(htmlCode);
};

export const toRaw = (text: string) => {
  return markdownToHtml.utils.escapeHtml(text);
  // return text
  //   .replaceAll(/\n/g, '')
  //   .replaceAll(/<hr\s*[/]?>\n/gi, '')
  //   .replaceAll(/&nbsp;/gi, ' ')
  //   .replaceAll(/<br\s*[/]?>/gi, '\r\n')
  //   .replaceAll(/<\/?[^>]*>/gi, '');
};
