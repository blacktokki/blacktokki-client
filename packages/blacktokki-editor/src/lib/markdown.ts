import markdownIt from 'markdown-it';
import TurndownService from 'turndown';
//@ts-ignore
import { tables } from 'turndown-plugin-gfm';

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

HtmlToMarkdown.use(tables);

// A function that renders markdown to HTML
export const renderer = (markdownCode: string) => {
  return markdownToHtml.render(markdownCode);
};

// A function that converts HTML back to Markdown
export const parser = (htmlCode: string) => {
  return HtmlToMarkdown.turndown(htmlCode);
};

export const toRaw = (text: string) => {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return doc.body.textContent || '';
  // return text
  //   .replaceAll(/\n/g, '')
  //   .replaceAll(/<hr\s*[/]?>\n/gi, '')
  //   .replaceAll(/&nbsp;/gi, ' ')
  //   .replaceAll(/<br\s*[/]?>/gi, '\r\n')
  //   .replaceAll(/<\/?[^>]*>/gi, '');
};

export const exportMarkdowns = async (
  contents: { title: string; description?: string }[],
  filename: string
) => {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const content of contents.filter((v) => (v.description?.length || 0) > 0)) {
    zip.file(content.title + '.md', parser(content.description as string));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.zip`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 500);
  a.remove();
};

export const importMarkdowns = async () => {
  const files = await new Promise<File[]>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/zip,.md,.markdown';
    input.style.display = 'none';
    input.multiple = true;

    input.onchange = () => {
      if (input.files && input.files.length > 0) {
        resolve(Array.from(input.files));
      } else {
        reject(new Error('파일이 선택되지 않았습니다.'));
      }
    };

    input.click(); // 파일 선택창 열기
  });
  const contents: { title: string; description: string }[] = [];
  const JSZip = (await import('jszip')).default;
  for (const file of files) {
    if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
      const zip = new JSZip();
      const files = (await zip.loadAsync(file)).files;
      for (const relativePath in files) {
        const file = zip.files[relativePath];
        if (!file.dir) {
          contents.push({
            title: relativePath.replace(/\.[^/.]+$/, ''),
            description: renderer((await file.async('text')).toString()),
          });
        }
      }
    } else if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
      contents.push({
        title: file.name.replace(/\.[^/.]+$/, ''),
        description: renderer(await file.text()),
      });
    }
  }
  return contents;
};
