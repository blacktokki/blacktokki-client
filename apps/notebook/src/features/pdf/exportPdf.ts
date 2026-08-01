import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { paragraphDescription } from '../../components/HeaderSelectBar';
import { NoteSectionProps } from '../../hooks/useExtension';

export const exportPdf = async (
  props: NoteSectionProps,
  commonStyles: any,
  styleType: 'clean' | 'theme' | 'midnight'
) => {
  const docTitle = props.path
    ? props.paragraphs.find((p) => p.path === props.path)?.title || props.title
    : props.title || 'Untitled';

  const contentHtml = props.path
    ? paragraphDescription(props.paragraphs, props.path, true)
    : props.paragraphs.map((p) => (p.level === 0 ? '' : p.header) + p.description).join('');

  const isDark =
    styleType === 'midnight' ||
    (styleType === 'theme' &&
      commonStyles.container.backgroundColor !== '#F5F5F5' &&
      commonStyles.container.backgroundColor !== '#FFFFFF');

  const isMidnight = styleType === 'midnight';
  const isClean = styleType === 'clean';

  const bgColor = isMidnight
    ? '#0F172A'
    : isClean
    ? '#FFFFFF'
    : commonStyles.container.backgroundColor || '#FFFFFF';
  const textColor = isMidnight
    ? '#CBD5E1'
    : isClean
    ? '#111111'
    : commonStyles.text.color || '#333333';
  const titleColor = isMidnight
    ? '#F8FAFC'
    : isClean
    ? '#000000'
    : commonStyles.title.color || '#000000';
  const borderColor = isMidnight
    ? '#334155'
    : isClean
    ? '#EEEEEE'
    : commonStyles.card?.borderColor || '#EEEEEE';
  const linkColor = isMidnight
    ? '#58A6FF'
    : isClean
    ? '#0366D6'
    : commonStyles.button.backgroundColor || '#0366D6';
  const codeBgColor = isMidnight
    ? '#020617'
    : isClean
    ? '#F6F8FA'
    : commonStyles.card?.backgroundColor || '#F6F8FA';
  const quoteColor = isMidnight
    ? '#94A3B8'
    : isClean
    ? '#6A737D'
    : commonStyles.smallText?.color || '#6A737D';

  const inlineCodeColor = isMidnight ? '#93C5FD' : textColor;
  const inlineCodeBgColor = isMidnight ? '#1E293B' : codeBgColor;

  const css = `
      *, ::after, ::before, html, body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      html, body {
        background-color: ${bgColor} !important;
        color: ${textColor} !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6;
        word-wrap: break-word;
      }
      body {
        padding: 32px;
      }
      h1, h2, h3, h4, h5, h6 {
        color: ${titleColor} !important;
        border-bottom: 1px solid ${borderColor};
        padding-bottom: 0.3em;
        margin-top: 1.5em;
        margin-bottom: 0.5em;
      }
      h1 { font-size: 24px; }
      h2 { font-size: 20px; }
      h3 { font-size: 18px; }
      .pdf-doc-title {
        margin-top: 0;
        padding-bottom: 12px;
        border-bottom: 2px solid ${titleColor};
      }
      a {
        color: ${linkColor} !important;
        text-decoration: underline;
      }
      code {
        background-color: ${inlineCodeBgColor} !important;
        color: ${inlineCodeColor} !important;
        border-radius: 4px;
        padding: 4px 8px;
        font-family: monospace;
      }
      pre {
        background-color: ${codeBgColor} !important;
        border: 1px solid ${borderColor};
        border-radius: 4px;
        padding: 12px;
        overflow-x: auto;
      }
      pre code {
        background-color: transparent !important;
        color: ${textColor} !important;
        padding: 0;
      }
      blockquote {
        border-left: 4px solid ${linkColor} !important;
        color: ${quoteColor} !important;
        padding: 4px 16px;
        margin: 0;
      }
      img {
        max-width: 100%;
        height: auto;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 16px 0;
      }
      table, th, td {
        border: 1px solid ${borderColor};
      }
      th, td {
        padding: 8px 12px;
        text-align: left;
      }
      th {
        background-color: ${codeBgColor};
      }
      @media print {
        *, ::after, ::before, html, body {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        html, body {
          background-color: ${bgColor} !important;
          color: ${textColor} !important;
          padding: 0 !important;
          margin: 0 !important;
        }
      }
    `;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${docTitle}</title>
  <style>
    ${css}
  </style>
</head>
<body class="${isDark ? 'dark' : 'light'}">
  <h1 class="pdf-doc-title">${docTitle}</h1>
  <div class="pdf-content">
    ${contentHtml}
  </div>
</body>
</html>`;

  try {
    if (Platform.OS === 'web') {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(() => {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          }
          setTimeout(() => {
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          }, 1000);
        }, 250);
      }
    } else {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          UTI: '.pdf',
          mimeType: 'application/pdf',
          dialogTitle: `${docTitle} PDF`,
        });
      }
    }
  } catch (err) {
    console.error('Error generating PDF:', err);
  }
};
