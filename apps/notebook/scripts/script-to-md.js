const fs = require('fs');
const path = require('path');

const SRC_DIR = 'src';
const OUTPUT_FILE = 'script.md';
const EXTENSIONS = ['js', 'ts', 'jsx', 'tsx'];

const extensionToLang = {
  js: 'javascript',
  ts: 'typescript',
  jsx: 'jsx',
  tsx: 'tsx',
};

function getAllFiles(dir, exts, fileList = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);

    if (stat.isDirectory()) {
      getAllFiles(filepath, exts, fileList);
    } else if (exts.includes(path.extname(file).slice(1))) {
      fileList.push(filepath);
    }
  }

  return fileList;
}

function generateMarkdown() {
  const files = getAllFiles(SRC_DIR, EXTENSIONS);
  const output = [];

  for (const file of files) {
    const ext = path.extname(file).slice(1);
    const lang = extensionToLang[ext] || '';
    const content = fs.readFileSync(file, 'utf8');

    output.push(`## ${file}\n`);
    output.push(`\`\`\`${lang}`);
    output.push(content);
    output.push('```');
    output.push('');
  }

  fs.writeFileSync(OUTPUT_FILE, output.join('\n'));
  console.log(`✅ Markdown saved to ${OUTPUT_FILE}`);
}

generateMarkdown();
