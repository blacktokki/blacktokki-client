const jsYaml = require('js-yaml');
const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const Module = require('node:module');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-frontmatter-test-'));
const knowledgeGraphDirectory = path.join(__dirname, '..');
for (const name of [
  'frontmatter',
  'relations',
  'palette',
  'externalLinkClassification',
  'axioms',
  'links',
  'paragraphClassification',
  'useKnowledgeGraphData',
]) {
  const directory =
    name === 'useKnowledgeGraphData'
      ? knowledgeGraphDirectory
      : path.join(knowledgeGraphDirectory, 'utils');
  const source = readFileSync(path.join(directory, `${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const outputDirectory = name === 'useKnowledgeGraphData' ? output : path.join(output, 'utils');
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(path.join(outputDirectory, `${name}.js`), compiled.outputText);
}

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
  if (request.endsWith('/inferBoardCandidates')) {
    const { parseHtmlToParagraphs } = Module._load(
      '../../components/HeaderSelectBar',
      parent,
      isMain
    );
    return { getBoardCandidateParagraphs: (note) => parseHtmlToParagraphs(note.description || '') };
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
  if (
    request.endsWith('/topicDashboard') ||
    request === './topicDashboard' ||
    request.endsWith('/topicDashoard') ||
    request === './topicDashoard'
  ) {
    return {
      inferTopicBoardPages: () => [],
      resolveTopicBoardPages: ({ boardPages = [] } = {}) => ({
        candidates: [],
        candidateCount: 0,
        effectiveBoardPages: boardPages,
      }),
      useResolvedTopicBoards: ({ boardPages = [] } = {}) => ({
        candidates: [],
        candidateCount: 0,
        effectiveBoardPages: boardPages,
      }),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let extractYamlFrontmatter;
let useKnowledgeGraphData;
try {
  ({ extractYamlFrontmatter } = require(path.join(output, 'utils/frontmatter.js')));
  ({ useKnowledgeGraphData } = require(path.join(output, 'useKnowledgeGraphData.js')));
} finally {
  Module._load = originalLoad;
}

test('extractYamlFrontmatter parses markdown frontmatter blocks', () => {
  const md = `---
title: Test Note
author: Alice
schedule: 2026-09-21
count: 42
isPublished: true
tags:
  - knowledgeGraph
  - zettelkasten
---
# Actual Note Content
Some paragraph text.`;

  const props = extractYamlFrontmatter(md);
  assert.equal(props.title, 'Test Note');
  assert.equal(props.author, 'Alice');
  assert.equal(props.schedule, '2026-09-21');
  assert.equal(props.count, 42);
  assert.equal(props.isPublished, true);
  assert.deepEqual(props.tags, ['knowledgeGraph', 'zettelkasten']);
});

test('extractYamlFrontmatter parses editor HTML frontmatter divs', () => {
  const rawYaml = 'category: science\nschedule: 2026-10-01\nstatus: active';
  const html = `<div class="yaml-frontmatter" data-yaml="${encodeURIComponent(
    rawYaml
  )}" style="display: none;"><br></div><h1>Note Header</h1><p>Body</p>`;

  const props = extractYamlFrontmatter(html);
  assert.equal(props.category, 'science');
  assert.equal(props.schedule, '2026-10-01');
  assert.equal(props.status, 'active');
});

test('extractYamlFrontmatter safely returns empty object on invalid or absent frontmatter', () => {
  assert.deepEqual(extractYamlFrontmatter(''), {});
  assert.deepEqual(extractYamlFrontmatter(undefined), {});
  assert.deepEqual(extractYamlFrontmatter('Plain content with no frontmatter'), {});
  assert.deepEqual(extractYamlFrontmatter('---\ninvalid: [yaml\n---'), {});
  assert.deepEqual(extractYamlFrontmatter('---\n- list item only\n---'), {});
});

test('enforces that only NOTE instances have properties, while classes, cards and paragraphs have empty properties', () => {
  state.boardPages = [
    {
      id: 'b1',
      title: '프로젝트',
      updated: '2026-09-01T00:00:00.000Z',
      option: { BOARD_HEADER_LEVEL: 3 },
    },
  ];
  state.notePages = [
    {
      id: 'n1',
      title: '일반 노트',
      updated: '2026-09-10T00:00:00.000Z',
      description: `---
author: Alice
schedule: 2026-09-21
---
<h1>섹션 제목</h1>
<p>본문 내용입니다. 2026-09-99 날짜 텍스트</p>`,
    },
    {
      id: 'n2',
      title: '프로젝트/할 일',
      updated: '2026-09-15T00:00:00.000Z',
      description: `<h3>카드 작업 1</h3>
<p>카드 본문 2026-09-17</p>
<h4>카드 하위 헤더</h4>`,
    },
  ];

  const graph = useKnowledgeGraphData();

  // 1. Classes must have empty properties
  const classNodes = graph.nodes.filter((n) => n.role === 'CLASS');
  assert.ok(classNodes.length > 0);
  for (const c of classNodes) {
    assert.deepEqual(
      c.properties,
      {},
      `Class node ${c.id} must have empty properties, but had ${JSON.stringify(c.properties)}`
    );
  }

  // 2. Card instances must have empty properties
  const cardNodes = graph.nodes.filter((n) => n.role === 'INSTANCE' && n.instanceKind === 'CARD');
  assert.ok(cardNodes.length > 0);
  for (const card of cardNodes) {
    assert.deepEqual(
      card.properties,
      {},
      `Card node ${card.id} must have empty properties, but had ${JSON.stringify(card.properties)}`
    );
  }

  // 3. Paragraph instances must have empty properties
  const paraNodes = graph.nodes.filter(
    (n) => n.role === 'INSTANCE' && n.instanceKind === 'PARAGRAPH'
  );
  assert.ok(paraNodes.length > 0);
  for (const p of paraNodes) {
    assert.deepEqual(
      p.properties,
      {},
      `Paragraph node ${p.id} must have empty properties, but had ${JSON.stringify(p.properties)}`
    );
  }

  // 4. Note instances have properties only from frontmatter (no updated, no sections, no regex schedule)
  const noteNode = graph.nodes.find((n) => n.id === 'note:content:n1');
  assert.ok(noteNode);
  assert.equal(noteNode.properties.author, 'Alice');
  assert.equal(noteNode.properties.schedule, '2026-09-21');
  assert.equal(noteNode.properties.updated, undefined);
  // sections and regex-extracted schedule must NOT exist in properties
  assert.equal(noteNode.properties.sections, undefined);
  assert.notEqual(noteNode.properties.schedule, '2026-09-99');
});

test('updated is not injected automatically and only exists if explicitly declared in YAML frontmatter', () => {
  state.boardPages = [];
  state.notePages = [
    {
      id: 'n_with_frontmatter_updated',
      title: '프론트매터에 updated 명시된 노트',
      updated: '2026-09-01T00:00:00.000Z',
      description: `---
updated: '2026-10-15T12:34:56.000Z'
customField: value123
---
<p>노트 본문</p>`,
    },
    {
      id: 'n_without_frontmatter_updated',
      title: '프론트매터에 updated 없는 노트',
      updated: '2026-09-01T00:00:00.000Z',
      description: `---
author: Charlie
---
<p>노트 본문</p>`,
    },
  ];

  const graph = useKnowledgeGraphData();
  const noteNode1 = graph.nodes.find((n) => n.id === 'note:content:n_with_frontmatter_updated');
  assert.ok(noteNode1);
  assert.equal(noteNode1.properties.updated, '2026-10-15T12:34:56.000Z');
  assert.equal(noteNode1.properties.customField, 'value123');

  const noteNode2 = graph.nodes.find((n) => n.id === 'note:content:n_without_frontmatter_updated');
  assert.ok(noteNode2);
  assert.equal(noteNode2.properties.updated, undefined);
  assert.equal(noteNode2.properties.author, 'Charlie');
});

test('board column note instance supports YAML frontmatter properties and implements Board Class', () => {
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

  const graph = useKnowledgeGraphData();
  const boardClass = graph.nodes.find((n) => n.classKind === 'BOARD_CARD');
  const columnNode = graph.nodes.find(
    (n) => n.instanceKind === 'NOTE' && n.name === '프로젝트 보드/진행중'
  );

  assert.ok(boardClass);
  assert.ok(columnNode);

  // Column note instance has frontmatter properties
  assert.equal(columnNode.properties.stage, 'in-progress');
  assert.equal(columnNode.properties.capacity, 5);
  assert.equal(columnNode.properties.assignee, 'donghyuk');

  // Column note instance directly implements Board Class
  assert.ok(
    graph.edges.some(
      (e) => e.type === 'INSTANCE_OF' && e.source === columnNode.id && e.target === boardClass.id
    )
  );

  // Board Status Subclass does not exist
  assert.equal(
    graph.nodes.some((n) => n.classKind === 'BOARD_STATUS'),
    false
  );
});
