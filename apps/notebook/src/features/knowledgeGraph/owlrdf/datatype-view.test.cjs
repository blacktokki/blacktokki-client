const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const Module = require('node:module');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const jsYaml = require('js-yaml');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-frontmatter-test-'));
const knowledgeGraphDirectory = path.join(__dirname, '..');
for (const name of [
  'frontmatter',
  'relations',
  'palette',
  'externalLinkClassification',
  'text',
  'axioms',
  'links',
  'paragraphClassification',
  'useKnowledgeGraphData',
]) {
  const sourceFile =
    name === 'relations'
      ? path.join(knowledgeGraphDirectory, 'utils/relations.ts')
      : name === 'useKnowledgeGraphData'
      ? path.join(knowledgeGraphDirectory, `${name}.ts`)
      : path.join(knowledgeGraphDirectory, 'utils', `${name}.ts`);
  const source = readFileSync(sourceFile, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const outputDirectory = name === 'useKnowledgeGraphData' ? output : path.join(output, 'utils');
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(path.join(outputDirectory, `${name}.js`), compiled.outputText);
}
writeFileSync(
  path.join(output, 'inference.js'),
  ts.transpileModule(readFileSync(path.join(__dirname, 'inference.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
);
writeFileSync(
  path.join(output, 'datatypeGraph.js'),
  ts.transpileModule(
    readFileSync(path.join(__dirname, 'datatypeGraph.ts'), 'utf8').replaceAll(
      '../utils/palette',
      './utils/palette'
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText
);
writeFileSync(
  path.join(output, 'useOwlRdfGraphData.js'),
  ts.transpileModule(
    readFileSync(path.join(__dirname, 'useOwlRdfGraphData.ts'), 'utf8').replaceAll(
      '../useKnowledgeGraphData',
      './useKnowledgeGraphData'
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText
);

const state = {
  boardPages: [],
  notePages: [],
  problemData: [],
  htmlLinks: new Map(),
  noteLinkTargets: new Map(),
};
const originalLoad = Module._load;
Module._load = function loadKnowledgeGraphTestDependency(request, parent, isMain) {
  if (request === '@blacktokki/core') {
    return { useLangContext: () => ({ lang: () => '' }) };
  }
  if (request === 'js-yaml') {
    return jsYaml;
  }
  if (request === '@blacktokki/editor') {
    return {
      extractHtmlLinks: (html) => state.htmlLinks.get(html) || [],
      toRaw: (html) => html.replace(/<[^>]*>/g, ' '),
    };
  }
  if (request === 'react') {
    return {
      useCallback: (callback) => callback,
      useMemo: (factory) => factory(),
    };
  }
  if (request.endsWith('/components/HeaderSelectBar')) {
    return {
      paragraphDescription: () => '',
      parseHtmlToParagraphs: (html) => {
        const paragraphs = [
          { title: '', level: 0, path: '', description: html, autoSection: undefined },
        ];
        const ancestors = [];
        for (const [index, match] of [
          ...html.matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi),
        ].entries()) {
          const level = Number(match[1]);
          while (ancestors.length > 0 && ancestors.at(-1).level >= level) ancestors.pop();
          const path = [ancestors.at(-1)?.path, `heading-${index}`].filter(Boolean).join(',');
          paragraphs.push({
            title: match[2].replace(/<[^>]*>/g, '').trim(),
            level,
            path,
            header: match[0],
            description: '',
            autoSection: /data-section=["']([^"']+)["']/i.exec(match[0])?.[1],
          });
          ancestors.push({ level, path });
        }
        return paragraphs;
      },
    };
  }
  if (request.endsWith('/components/SearchBar')) {
    return { urlToNoteLink: (url) => state.noteLinkTargets.get(url) };
  }
  if (request.endsWith('/hooks/useBoardStorage')) {
    return { useBoardPages: () => ({ data: state.boardPages, isLoading: false }) };
  }
  if (request.endsWith('/hooks/useNoteStorage')) {
    return { useNotePages: () => ({ data: state.notePages, isLoading: false }) };
  }
  if (request.endsWith('/hooks/useNotebookTheme')) {
    return { useNotebookTheme: () => ({ colorScheme: 'light' }) };
  }
  if (request.endsWith('/hooks/useUsageMode')) {
    return { useUsageMode: () => ({ usageMode: 'NOTE', notebook: null }) };
  }
  if (request.endsWith('/problem/useProblem')) {
    return { __esModule: true, default: () => ({ data: state.problemData, isLoading: false }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let useOwlRdfGraphData;
try {
  ({ useOwlRdfGraphData } = require(path.join(output, 'useOwlRdfGraphData.js')));
} finally {
  Module._load = originalLoad;
}

test('VOWL datatype nodes and edges are generated exclusively from NOTE instances properties', () => {
  state.boardPages = [
    {
      id: 'b2',
      title: '칸반',
      updated: '2026-09-01T00:00:00.000Z',
      option: { BOARD_HEADER_LEVEL: 3 },
    },
  ];
  state.notePages = [
    {
      id: 'n_dt',
      title: '리터럴 테스트 노트',
      updated: '2026-09-12T00:00:00.000Z',
      description: `---
schedule: 2026-09-25
author: Bob
---
<p>본문</p>`,
    },
    {
      id: 'n_card_source',
      title: '칸반/진행',
      updated: '2026-09-12T00:00:00.000Z',
      description: `<h3>카드 항목 2026-09-30</h3><p>카드 본문</p>`,
    },
  ];

  const graph = useOwlRdfGraphData();

  // No datatype edges from CARD instances
  const cardEdges = graph.datatypeEdges.filter((e) => e.source.startsWith('card:'));
  assert.equal(cardEdges.length, 0, 'Card instances must not generate datatype edges');

  // Datatype edges must originate from NOTE instances
  const noteNodeId = 'note:content:n_dt';
  const noteDtEdges = graph.datatypeEdges.filter((e) => e.source === noteNodeId);
  assert.ok(noteDtEdges.length >= 2, 'NOTE instance must have datatype edges for its properties');

  const edgeLabels = new Set(noteDtEdges.map((e) => e.propertyLabel));
  assert.ok(edgeLabels.has('hasSchedule'));
  assert.ok(edgeLabels.has('hasAuthor'));
  assert.ok(!edgeLabels.has('hasUpdated'));

  // Target literal nodes must exist in datatypeNodes
  for (const edge of noteDtEdges) {
    const targetNode = graph.datatypeNodes.find((lit) => lit.id === edge.target);
    assert.ok(targetNode, `Datatype target node ${edge.target} must exist in datatypeNodes`);
    assert.equal(targetNode.role, 'LITERAL');
    assert.deepEqual(targetNode.properties, {});
  }
});

test('board column note properties produce datatype relations', () => {
  state.boardPages = [
    {
      id: 'board_prj',
      title: '프로젝트 보드',
      updated: '2026-09-01T00:00:00.000Z',
      option: { BOARD_HEADER_LEVEL: 3 },
    },
  ];
  state.notePages = [
    {
      id: 'col_doing',
      title: '프로젝트 보드/진행중',
      updated: '2026-09-02T00:00:00.000Z',
      description: `---
stage: in-progress
capacity: 5
assignee: donghyuk
---
<h3>작업 A</h3><p>작업 A 내용</p>`,
    },
  ];

  const graph = useOwlRdfGraphData();
  const columnNode = graph.nodes.find(
    (node) => node.instanceKind === 'NOTE' && node.name === '프로젝트 보드/진행중'
  );
  assert.ok(columnNode);
  const labels = new Set(
    graph.datatypeEdges
      .filter((edge) => edge.source === columnNode.id)
      .map((edge) => edge.propertyLabel)
  );
  assert.ok(labels.has('hasStage'));
  assert.ok(labels.has('hasCapacity'));
  assert.ok(labels.has('hasAssignee'));
});
