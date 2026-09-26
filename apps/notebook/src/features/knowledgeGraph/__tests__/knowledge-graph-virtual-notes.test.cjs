const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-virtual-notes-'));
let isTopicVirtualNoteEligible;
let synthesizeTopicVirtualNote;
let extractTopicKeyword;
let isTopicClass;
let findMatchingPhysicalNote;
let buildTopicListItemData;
let buildTopicListItemsData;
let compareTopicListItems;
let getTopicRelationCount;
let findRelatedTopics;
let topicNodeIdFromUrl;

try {
  for (const name of ['titleKeywordClasses', 'virtualNotes']) {
    const source = readFileSync(path.join(__dirname, '../utils', `${name}.ts`), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  ({
    isTopicVirtualNoteEligible,
    synthesizeTopicVirtualNote,
    extractTopicKeyword,
    isTopicClass,
    findMatchingPhysicalNote,
    buildTopicListItemData,
    buildTopicListItemsData,
    compareTopicListItems,
    getTopicRelationCount,
    findRelatedTopics,
    topicNodeIdFromUrl,
    getTopicVirtualNoteEligibleSet,
  } = require(path.join(output, 'virtualNotes.js')));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const node = (id, overrides = {}) => ({
  id,
  name: id,
  role: 'INSTANCE',
  type: 'INSTANCE',
  noteTitle: id,
  properties: { sections: [] },
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 10,
  color: '#000',
  ...overrides,
});

const edge = (source, target, type, id = `${source}:${type}:${target}`) => ({
  id,
  source,
  target,
  type,
});

test('unified topics count external links and source notes without treating URLs as notes', () => {
  const topic = node('class:link-topic', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: '주제: 문서',
    matchLabel: '문서',
  });
  const link = node('external:1', {
    instanceKind: 'CONNECTED_EXTERNAL_LINK',
    name: '문서',
    noteTitle: '문서',
    description: 'https://example.com/docs',
  });
  const sourceA = node('note:a', { instanceKind: 'NOTE', name: '출처 A', noteTitle: '출처 A' });
  const sourceB = node('note:b', { instanceKind: 'NOTE', name: '출처 B', noteTitle: '출처 B' });
  const nodes = [topic, link, sourceA, sourceB];
  const edges = [
    edge(link.id, topic.id, 'INSTANCE_OF'),
    edge(sourceA.id, link.id, 'EXTERNAL_REFERENCE'),
    edge(sourceB.id, link.id, 'EXTERNAL_REFERENCE'),
  ];

  const item = buildTopicListItemData(topic, nodes, edges);
  const virtualNote = synthesizeTopicVirtualNote(topic, nodes, edges);
  assert.equal(item.linkCount, 2);
  assert.equal(item.sourceNoteCount, 2);
  assert.equal(item.paragraphCount, 0);
  assert.deepEqual(item.matchingNoteTitle, undefined);
  assert.deepEqual(virtualNote.sourceNoteTitles, ['출처 A', '출처 B']);
  assert.match(virtualNote.content, /https:\/\/example\.com\/docs/);
  assert.doesNotMatch(virtualNote.content, /\[문서\]\(\?title=/);
});

test('shared board paragraph counts every source note but remains one paragraph', () => {
  const topic = node('class:shared-topic', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: '주제: 공통 묶음',
    matchLabel: '공통 묶음',
  });
  const paragraph = node('board-paragraph', {
    instanceKind: 'BOARD_PARAGRAPH',
    name: '공통 묶음',
    boardTitle: '프로젝트',
    noteTitle: '프로젝트/진행',
    paragraphOccurrences: ['프로젝트/진행', '프로젝트/완료', '프로젝트/대기'].map(
      (origin, index) => ({ origin, title: '공통 묶음', level: 2, path: `heading-${index}` })
    ),
  });
  const nodes = [topic, paragraph];
  const edges = [edge(paragraph.id, topic.id, 'INSTANCE_OF')];

  const virtualNote = synthesizeTopicVirtualNote(topic, nodes, edges);
  assert.equal(virtualNote.paragraphCount, 1);
  assert.deepEqual(virtualNote.sourceNoteTitles, [
    '프로젝트/대기',
    '프로젝트/완료',
    '프로젝트/진행',
  ]);
  assert.ok(virtualNote.content.includes(`?title=${encodeURIComponent('프로젝트/완료')}`));
});

test('extracts topic keyword correctly from matchLabel or node name', () => {
  assert.equal(
    extractTopicKeyword(
      node('class:1', {
        role: 'CLASS',
        classCategory: 'TOPIC',
        name: '주제: api',
        matchLabel: 'api',
      })
    ),
    'api'
  );
  assert.equal(
    extractTopicKeyword(
      node('class:2', { role: 'CLASS', classCategory: 'TOPIC', name: 'H2 제목: 배포' })
    ),
    '배포'
  );
  assert.equal(
    extractTopicKeyword(
      node('class:3', { role: 'CLASS', classCategory: 'TOPIC', name: '주제: 백엔드' })
    ),
    '백엔드'
  );
  assert.equal(
    extractTopicKeyword(
      node('class:4', { role: 'CLASS', classCategory: 'TOPIC', name: '노트 제목: python' })
    ),
    'python'
  );
});

test('isTopicVirtualNoteEligible returns true for a generic topic superclass when no physical note exists', () => {
  const topicNode = node('class:topic:api', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: '주제: api',
    matchLabel: 'api',
  });

  const subClassNode = node('class:sub:api', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: 'H2 제목: api',
    matchLabel: 'api',
  });

  const edges = [
    edge('class:sub:api', 'class:topic:api', 'SUBCLASS_OF'),
    edge('inst:para:1', 'class:sub:api', 'INSTANCE_OF'),
  ];

  const allNodes = [
    topicNode,
    subClassNode,
    node('inst:note:frontend', { role: 'INSTANCE', instanceKind: 'NOTE', name: '프론트엔드' }),
    node('inst:para:1', { role: 'INSTANCE', instanceKind: 'PARAGRAPH', name: 'API 명세' }),
  ];

  assert.equal(isTopicVirtualNoteEligible(topicNode, edges, allNodes), true);
});

test('a matching physical note does not block the topic virtual note', () => {
  const topicNode = node('class:topic:api', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: '주제: api',
    matchLabel: 'api',
  });

  const edges = [];

  // Case 1: Exact match
  const allNodesExact = [
    topicNode,
    node('inst:note:api', { role: 'INSTANCE', instanceKind: 'NOTE', name: 'api' }),
  ];
  assert.equal(isTopicVirtualNoteEligible(topicNode, edges, allNodesExact), true);
  assert.equal(getTopicVirtualNoteEligibleSet(allNodesExact, edges).has(topicNode.id), true);
  assert.match(
    synthesizeTopicVirtualNote(topicNode, allNodesExact, edges).content,
    /실제 노트로 이동/
  );
  assert.match(
    synthesizeTopicVirtualNote(topicNode, [topicNode], edges, undefined, 'api').content,
    /실제 노트로 이동/
  );

  // Case 2: A matching leaf under a different path remains eligible.
  const allNodesLeaf = [
    topicNode,
    node('inst:note:leaf', { role: 'INSTANCE', instanceKind: 'NOTE', name: 'docs/backend/api' }),
  ];
  assert.equal(isTopicVirtualNoteEligible(topicNode, edges, allNodesLeaf), true);
  assert.equal(getTopicVirtualNoteEligibleSet(allNodesLeaf, edges).has(topicNode.id), true);

  // Case 3: Case-insensitive match (API vs api)
  const allNodesCase = [
    topicNode,
    node('inst:note:upper', { role: 'INSTANCE', instanceKind: 'NOTE', name: 'API' }),
  ];
  assert.equal(isTopicVirtualNoteEligible(topicNode, edges, allNodesCase), true);
});

test('cards and paragraphs with the same name do not masquerade as physical notes', () => {
  const topicNode = node('class:topic:api', {
    role: 'CLASS',
    type: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: api',
    matchLabel: 'api',
  });
  const allNodes = [
    topicNode,
    node('card:api', { instanceKind: 'CARD', name: 'api' }),
    node('paragraph:api', { instanceKind: 'PARAGRAPH', name: 'api' }),
  ];

  assert.equal(findMatchingPhysicalNote('api', allNodes), undefined);
  assert.equal(isTopicVirtualNoteEligible(topicNode, [], allNodes), true);
  assert.equal(getTopicVirtualNoteEligibleSet(allNodes, []).has(topicNode.id), true);
});

test('each flat topic class can create its own virtual note', () => {
  const topicNode = node('class:topic:api', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: api',
    matchLabel: 'api',
  });

  const secondTopic = node('class:topic:api-design', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: api 설계',
    matchLabel: 'api 설계',
  });

  assert.equal(isTopicVirtualNoteEligible(secondTopic), true);
  assert.equal(isTopicVirtualNoteEligible(topicNode), true);
});

test('isTopicVirtualNoteEligible returns true for standalone topic classes without parent subclasses', () => {
  const standaloneNode = node('class:sub:deploy', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: 'H2 제목: 배포',
    matchLabel: '배포',
  });

  const edges = [edge('inst:para:1', 'class:sub:deploy', 'INSTANCE_OF')];

  const allNodes = [
    standaloneNode,
    node('inst:note:server', { role: 'INSTANCE', instanceKind: 'NOTE', name: '서버 구축' }),
  ];

  assert.equal(isTopicVirtualNoteEligible(standaloneNode, edges, allNodes), true);
});

test('isTopicVirtualNoteEligible returns false for built-in or board classes or non-classes', () => {
  const builtInNode = node('class:note', {
    role: 'CLASS',
    classCategory: 'BUILT_IN',
    name: 'Note',
  });
  const boardNode = node('class:board', { role: 'CLASS', classCategory: 'BOARD', name: 'Sprint' });
  const instanceNode = node('inst:note:1', {
    role: 'INSTANCE',
    instanceKind: 'NOTE',
    name: 'MyNote',
  });

  assert.equal(isTopicVirtualNoteEligible(builtInNode, [], []), false);
  assert.equal(isTopicVirtualNoteEligible(boardNode, [], []), false);
  assert.equal(isTopicVirtualNoteEligible(instanceNode, [], []), false);
});

test('synthesizeTopicVirtualNote aggregates direct paragraph and card members', () => {
  const topicNode = node('class:topic:api', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: '주제: api',
    matchLabel: 'api',
  });

  const headerSubclass = node('class:sub:header', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: 'H2 제목: api',
    matchLabel: 'api',
  });

  const cardSubclass = node('class:sub:board', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: '주제: 백엔드',
    matchLabel: '백엔드',
  });

  const linkSubclass = node('class:sub:link', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: '주제: API 명세',
    matchLabel: 'API 명세',
  });

  const paraInst1 = node('inst:para:1', {
    role: 'INSTANCE',
    instanceKind: 'PARAGRAPH',
    name: 'REST API 설계',
    noteTitle: '아키텍처',
    paragraph: {
      origin: '아키텍처',
      title: 'REST API 설계',
      level: 2,
      path: 'arch,api',
      description: '<p>REST 엔드포인트 목록 및 규격 정의</p>',
    },
  });

  const paraInst2 = node('inst:para:2', {
    role: 'INSTANCE',
    instanceKind: 'PARAGRAPH',
    name: 'GraphQL API',
    noteTitle: '클라이언트 개발',
    paragraph: {
      origin: '클라이언트 개발',
      title: 'GraphQL API',
      level: 2,
      path: 'dev,gql',
      description: '<p>클라이언트 쿼리 정의</p>',
    },
  });

  const cardInst = node('inst:card:1', {
    role: 'INSTANCE',
    instanceKind: 'CARD',
    name: '인증 API 개발',
    boardTitle: 'Sprint 1',
    noteTitle: 'Sprint 1/In Progress',
    description: '<p>JWT 토큰 검증 핸들러 작성</p>',
    paragraph: {
      origin: 'Sprint 1/In Progress',
      title: '인증 API 개발',
      level: 3,
      path: 'sprint,card',
      description: '<p>JWT 토큰 검증 핸들러 작성</p>',
    },
    properties: {
      schedule: '2026-09-30',
      sections: [],
    },
  });

  const allNodes = [
    topicNode,
    headerSubclass,
    cardSubclass,
    linkSubclass,
    paraInst1,
    paraInst2,
    cardInst,
  ];

  const edges = [
    edge(paraInst1.id, topicNode.id, 'INSTANCE_OF'),
    edge(paraInst2.id, topicNode.id, 'INSTANCE_OF'),
    edge(cardInst.id, topicNode.id, 'INSTANCE_OF'),
  ];

  const virtualNote = synthesizeTopicVirtualNote(topicNode, allNodes, edges);

  assert.equal(virtualNote.topicKeyword, 'api');
  assert.equal(virtualNote.title, 'api');
  assert.equal('subclassCount' in virtualNote, false);
  assert.equal(virtualNote.linkCount, 0);
  assert.equal(virtualNote.paragraphCount, 2);
  assert.equal(virtualNote.cardCount, 1);
  assert.equal(virtualNote.relatedTopicCount, 0);
  assert.deepEqual(
    virtualNote.sourceNoteTitles.sort(),
    ['Sprint 1/In Progress', '클라이언트 개발', '아키텍처'].sort()
  );

  // Check Markdown content
  assert.match(virtualNote.content, /# \[가상노트\] api/);
  assert.match(virtualNote.content, /## 🗂️ 주제 색인/);
  assert.doesNotMatch(virtualNote.content, /\*\*주제 키워드\*\*/);
  assert.doesNotMatch(virtualNote.content, /하위 분류|Subclasses/);
  assert.match(virtualNote.content, /\*\*링크\*\*: 없음/);
  assert.match(virtualNote.content, /문단 \(2\)\*\*:/);
  assert.match(virtualNote.content, /보드 카드 \(1\)\*\*:/);
  assert.doesNotMatch(virtualNote.content, /종합 문단|종합 카드/);
  assert.match(virtualNote.content, /\[아키텍처\]\(\?title=%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98\)/);
  assert.match(
    virtualNote.content,
    /\[클라이언트 개발\]\(\?title=%ED%81%B4%EB%9D%BC%EC%9D%B4%EC%96%B8%ED%8A%B8\+%EA%B0%9C%EB%B0%9C\)/
  );
  assert.match(
    virtualNote.content,
    /\[Sprint 1\/In Progress\]\(\?title=Sprint\+1%2FIn\+Progress\)/
  );

  assert.doesNotMatch(virtualNote.content, /주제 하위 분류별 지식|Knowledge by Subclass|^### 📁/m);
  assert.doesNotMatch(
    virtualNote.content,
    /REST 엔드포인트 목록 및 규격 정의|JWT 토큰 검증 핸들러 작성|📅 Schedule/
  );
});

test('synthesizeTopicVirtualNote does not restore the removed direct-related-knowledge section', () => {
  const topicNode = node('class:topic:api', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: '주제: api',
    matchLabel: 'api',
  });
  const directParagraph = node('paragraph:direct', {
    role: 'INSTANCE',
    instanceKind: 'PARAGRAPH',
    name: 'API 개요',
    noteTitle: 'API 노트',
    paragraph: {
      origin: 'API 노트',
      title: 'API 개요',
      level: 2,
      path: 'api',
      description: '<p>직접 소속 문단</p>',
    },
  });

  const virtualNote = synthesizeTopicVirtualNote(
    topicNode,
    [topicNode, directParagraph],
    [edge(directParagraph.id, topicNode.id, 'INSTANCE_OF')]
  );

  assert.match(virtualNote.content, /문단 \(1\)/);
  assert.doesNotMatch(virtualNote.content, /직접 연관 지식|Directly Related Knowledge/);
});

test('lists direct link evidence under links instead of aggregated paragraphs', () => {
  const topicNode = node('class:topic:api', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: '주제: api',
    matchLabel: 'api',
  });
  const directLinkSource = node('paragraph:direct-link', {
    role: 'INSTANCE',
    instanceKind: 'PARAGRAPH',
    name: 'API 링크 모음',
    noteTitle: 'API 링크 모음',
    paragraph: {
      origin: 'API 링크 모음',
      title: 'API 링크 모음',
      level: 2,
      path: 'api-links',
      description: '<p>링크 모음</p>',
    },
  });
  const links = [
    ['API 문서', 'https://example.com/api'],
    ['API 가이드', 'https://example.org/guide'],
    ['API 명세', 'https://example.net/spec'],
  ].map(([name, url], index) =>
    node(`external:${index}`, {
      instanceKind: 'EXTERNAL_LINK',
      name,
      description: url,
    })
  );
  const edges = links.flatMap((link) => [
    edge(link.id, topicNode.id, 'INSTANCE_OF'),
    edge(directLinkSource.id, link.id, 'EXTERNAL_REFERENCE'),
  ]);
  const nodes = [topicNode, directLinkSource, ...links];

  const item = buildTopicListItemData(topicNode, nodes, edges);
  const virtualNote = synthesizeTopicVirtualNote(topicNode, nodes, edges);

  assert.equal(item.linkCount, 3);
  assert.equal(item.paragraphCount, 0);
  assert.match(item.subtitles[0], /링크 3/);
  assert.equal(virtualNote.linkCount, 3);
  assert.equal(virtualNote.paragraphCount, 0);
  assert.match(virtualNote.content, /링크 \(3\)\*\*:/);
  assert.match(virtualNote.content, /\[API 문서\]\(<https:\/\/example\.com\/api>\)/);
  assert.match(virtualNote.content, /\[API 가이드\]\(<https:\/\/example\.org\/guide>\)/);
  assert.doesNotMatch(virtualNote.content, /문단 \(1\)/);
});

test('shared instances and a link source do not meet the related-topic source-note threshold', () => {
  const currentTopic = node('class:topic:current-link', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: 현재 링크',
    matchLabel: '현재 링크',
  });
  const relatedTopic = node('class:topic:related-link', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: 연관 링크',
    matchLabel: '연관 링크',
  });
  const linkSource = node('paragraph:shared-link', {
    instanceKind: 'PARAGRAPH',
    name: '공유 링크',
    noteTitle: '링크 출처',
  });
  const firstKnowledge = node('paragraph:shared-knowledge-1', {
    instanceKind: 'PARAGRAPH',
    name: '공유 문단 1',
    noteTitle: '',
  });
  const secondKnowledge = node('paragraph:shared-knowledge-2', {
    instanceKind: 'PARAGRAPH',
    name: '공유 문단 2',
    noteTitle: '',
  });
  const externalLink = node('external:shared-link', {
    instanceKind: 'EXTERNAL_LINK',
    name: '공유 링크',
    description: 'https://example.com/shared',
  });
  const allNodes = [
    currentTopic,
    relatedTopic,
    linkSource,
    firstKnowledge,
    secondKnowledge,
    externalLink,
  ];
  const edges = [
    edge(externalLink.id, currentTopic.id, 'INSTANCE_OF'),
    edge(externalLink.id, relatedTopic.id, 'INSTANCE_OF'),
    edge(linkSource.id, externalLink.id, 'EXTERNAL_REFERENCE'),
    edge(firstKnowledge.id, currentTopic.id, 'INSTANCE_OF'),
    edge(firstKnowledge.id, relatedTopic.id, 'INSTANCE_OF'),
    edge(secondKnowledge.id, currentTopic.id, 'INSTANCE_OF'),
    edge(secondKnowledge.id, relatedTopic.id, 'INSTANCE_OF'),
  ];

  const related = findRelatedTopics(currentTopic, allNodes, edges);

  assert.equal(related.length, 0);
});

test('adds related-topic links only when three source notes overlap', () => {
  const currentTopic = node('class:topic:current', {
    role: 'CLASS',
    type: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: 현재',
    matchLabel: '현재',
  });
  const virtualTopic = node('class:topic:virtual', {
    role: 'CLASS',
    type: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: 가상연관',
    matchLabel: '가상연관',
  });
  const realTopic = node('class:topic:real', {
    role: 'CLASS',
    type: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: 실제연관',
    matchLabel: '실제연관',
  });
  const lowSupportTopic = node('class:topic:low-support', {
    role: 'CLASS',
    type: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: 근거부족',
    matchLabel: '근거부족',
  });
  const sharedVirtualInstance = node('paragraph:shared-virtual', {
    instanceKind: 'PARAGRAPH',
    noteTitle: '공유 노트 1',
    name: '공유 문단',
  });
  const sharedRealInstance = node('paragraph:shared-real', {
    instanceKind: 'PARAGRAPH',
    noteTitle: '공유 노트 2',
    name: '다른 공유 문단',
  });
  const sharedThresholdInstance = node('paragraph:shared-threshold', {
    instanceKind: 'PARAGRAPH',
    noteTitle: '공유 노트 3',
    name: '공유 보조 문단',
  });
  const sharedFourthInstance = node('paragraph:shared-fourth', {
    instanceKind: 'PARAGRAPH',
    noteTitle: '공유 노트 4',
    name: '공유 추가 문단',
  });
  const currentReferenceInstance = node('paragraph:current-reference', {
    instanceKind: 'PARAGRAPH',
    noteTitle: '현재 참조 노트',
    name: '현재 참조 문단',
  });
  const lowReferenceInstance = node('paragraph:low-reference', {
    instanceKind: 'PARAGRAPH',
    noteTitle: '근거 부족 참조 노트',
    name: '근거 부족 참조 문단',
  });
  const physicalTopicNote = node('note:real-topic', {
    instanceKind: 'NOTE',
    name: '실제연관',
    noteTitle: '실제연관',
  });
  const allNodes = [
    currentTopic,
    virtualTopic,
    realTopic,
    lowSupportTopic,
    sharedVirtualInstance,
    sharedRealInstance,
    sharedThresholdInstance,
    sharedFourthInstance,
    currentReferenceInstance,
    lowReferenceInstance,
    physicalTopicNote,
  ];
  const edges = [
    edge(sharedVirtualInstance.id, currentTopic.id, 'INSTANCE_OF'),
    edge(sharedVirtualInstance.id, virtualTopic.id, 'INSTANCE_OF'),
    edge(sharedRealInstance.id, currentTopic.id, 'INSTANCE_OF'),
    edge(sharedRealInstance.id, realTopic.id, 'INSTANCE_OF'),
    edge(sharedThresholdInstance.id, currentTopic.id, 'INSTANCE_OF'),
    edge(sharedThresholdInstance.id, virtualTopic.id, 'INSTANCE_OF'),
    edge(sharedThresholdInstance.id, realTopic.id, 'INSTANCE_OF'),
    edge(sharedThresholdInstance.id, lowSupportTopic.id, 'INSTANCE_OF'),
    edge(sharedFourthInstance.id, currentTopic.id, 'INSTANCE_OF'),
    edge(sharedFourthInstance.id, virtualTopic.id, 'INSTANCE_OF'),
    edge(sharedFourthInstance.id, realTopic.id, 'INSTANCE_OF'),
    edge(currentReferenceInstance.id, currentTopic.id, 'INSTANCE_OF'),
    edge(lowReferenceInstance.id, lowSupportTopic.id, 'INSTANCE_OF'),
    edge(currentReferenceInstance.id, lowReferenceInstance.id, 'REFERENCES'),
  ];

  const relatedTopics = findRelatedTopics(currentTopic, allNodes, edges);
  const virtualNote = synthesizeTopicVirtualNote(currentTopic, allNodes, edges);
  const topicListItem = buildTopicListItemData(currentTopic, allNodes, edges);

  assert.deepEqual(
    relatedTopics.map((topic) => topic.keyword).sort(),
    ['가상연관', '실제연관'].sort()
  );
  assert.match(virtualNote.content, /## 🔗 연관 주제/);
  assert.equal(virtualNote.relatedTopicCount, 2);
  assert.equal(topicListItem.relatedTopicCount, 2);
  assert.equal(
    buildTopicListItemsData(allNodes, edges).find((item) => item.id === currentTopic.id)
      ?.relatedTopicCount,
    2
  );
  assert.match(topicListItem.subtitles[0], /연관 주제 2/);
  assert.match(virtualNote.content, /\[가상연관\]\(\?ontologyTopic=/);
  assert.match(virtualNote.content, /\[📝 실제연관\]\(\?ontologyTopic=/);
  assert.match(virtualNote.content, /ontologyTopic=class%3Atopic%3Avirtual/);
  assert.match(virtualNote.content, /ontologyTopic=class%3Atopic%3Areal/);
  assert.doesNotMatch(virtualNote.content, /근거부족/);
  assert.doesNotMatch(virtualNote.content, /공유 지식/);
  assert.equal(
    topicNodeIdFromUrl(
      'https://blacktokki.local/?ontologyTopic=class%3Atopic%3Avirtual&title=virtual'
    ),
    'class:topic:virtual'
  );
});

test('virtual-note related topics list parents, children, and other matches separately', () => {
  const topic = (id, keyword) =>
    node(id, {
      role: 'CLASS',
      classCategory: 'TOPIC',
      classKind: 'TITLE_KEYWORD',
      name: `주제: ${keyword}`,
      matchLabel: keyword,
    });
  const current = topic('class:topic:current', '현재');
  const parent = topic('class:topic:parent', '상위');
  const child = topic('class:topic:child', '하위');
  const secondChild = topic('class:topic:second-child', '보조 하위');
  const other = topic('class:topic:other', '기타');
  const instances = [1, 2, 3, 4, 5].map((index) =>
    node(`paragraph:${index}`, {
      instanceKind: 'PARAGRAPH',
      name: `문단 ${index}`,
      noteTitle: `출처 ${index}`,
    })
  );
  const allNodes = [current, parent, child, secondChild, other, ...instances];
  const topicMembers = [
    [current, [1, 2, 3, 4]],
    [parent, [1, 2, 3, 4, 5]],
    [child, [1, 2, 3]],
    [secondChild, [1, 2, 4]],
    [other, [1, 2, 3, 5]],
  ];
  const edges = [
    ...topicMembers.flatMap(([classNode, sourceIndexes]) =>
      sourceIndexes.map((index) => edge(instances[index - 1].id, classNode.id, 'INSTANCE_OF'))
    ),
    edge(current.id, parent.id, 'SUBCLASS_OF'),
    edge(child.id, current.id, 'SUBCLASS_OF'),
    edge(secondChild.id, current.id, 'SUBCLASS_OF'),
    edge(child.id, parent.id, 'SUBCLASS_OF'),
    edge(secondChild.id, parent.id, 'SUBCLASS_OF'),
    edge(other.id, parent.id, 'SUBCLASS_OF'),
  ];

  const virtualNote = synthesizeTopicVirtualNote(current, allNodes, edges);
  assert.equal(virtualNote.relatedTopicCount, 4);
  assert.match(
    buildTopicListItemData(current, allNodes, edges).subtitles[0],
    /연관 주제 4 \(하위 주제 2\)$/
  );
  assert.match(
    buildTopicListItemsData(allNodes, edges).find((item) => item.id === current.id)?.subtitles[0],
    /연관 주제 4 \(하위 주제 2\)$/
  );
  assert.match(virtualNote.content, /- \*\*상위 주제 \(1\)\*\*:\n  - \[상위\]/);
  assert.match(virtualNote.content, /- \*\*하위 주제 \(2\)\*\*:/);
  assert.match(virtualNote.content, /  - \[하위\]/);
  assert.match(virtualNote.content, /  - \[보조 하위\]/);
  assert.match(virtualNote.content, /- \*\*그 외 연관 주제 \(1\)\*\*:\n  - \[기타\]/);
  assert.ok(
    virtualNote.content.indexOf('상위 주제') < virtualNote.content.indexOf('하위 주제') &&
      virtualNote.content.indexOf('하위 주제') < virtualNote.content.indexOf('그 외 연관 주제')
  );
});

test('isTopicClass accepts topic classes and excludes built-in classes', () => {
  const genericTopic = node('class:generic', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: api',
  });
  const childSubclass = node('class:child', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: 'H2 제목: api',
  });
  const standaloneTopic = node('class:standalone', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: 'H2 제목: 배포',
  });
  const builtInClass = node('class:builtin', {
    role: 'CLASS',
    classCategory: 'BUILT_IN',
    name: 'Note',
  });

  assert.equal(isTopicClass(genericTopic), true);
  assert.equal(isTopicClass(standaloneTopic), true);
  assert.equal(isTopicClass(childSubclass), true);
  assert.equal(isTopicClass(builtInClass), false);
});

test('findMatchingPhysicalNote matches only complete note names case-insensitively', () => {
  const allNodes = [
    node('note:1', { role: 'INSTANCE', instanceKind: 'NOTE', name: 'api' }),
    node('note:2', { role: 'INSTANCE', instanceKind: 'NOTE', name: 'docs/guide/architecture' }),
  ];

  assert.equal(findMatchingPhysicalNote('api', allNodes)?.id, 'note:1');
  assert.equal(findMatchingPhysicalNote('API', allNodes)?.id, 'note:1');
  assert.equal(findMatchingPhysicalNote('architecture', allNodes), undefined);
  assert.equal(findMatchingPhysicalNote('docs/guide/architecture', allNodes)?.id, 'note:2');
  assert.equal(findMatchingPhysicalNote('unknown', allNodes), undefined);
});

test('topic list keeps a virtual note when only a nested note has the same leaf name', () => {
  const topicNode = node('class:topic:aa', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: AA',
    matchLabel: 'AA',
  });
  const nestedNote = node('note:nested-aa', {
    role: 'INSTANCE',
    instanceKind: 'NOTE',
    name: 'BB/AA',
    noteTitle: 'BB/AA',
  });

  const item = buildTopicListItemsData([topicNode, nestedNote], [])[0];

  assert.equal(item.hasMatchingNote, false);
  assert.equal(item.link, 'virtual');
  assert.equal(isTopicVirtualNoteEligible(topicNode, [], [topicNode, nestedNote]), true);
});

test('buildTopicListItemData formats items for NoteListSection with correct connection state', () => {
  const genericTopic = node('class:generic', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: api',
    matchLabel: 'api',
  });
  const linkSubclass = node('class:link', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: '주제: API 명세',
    matchLabel: 'API 명세',
  });
  const childSubclass = node('class:child', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: 'H2 제목: api',
    matchLabel: 'api',
  });
  const standaloneTopic = node('class:deploy', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: 'H2 제목: 배포',
    matchLabel: '배포',
  });
  const standaloneLinkTopic = node('class:standalone-link', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: '주제: 독립 링크',
    matchLabel: '독립 링크',
  });
  const h4Topic = node('class:ts', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: 'H4: typescript',
  });

  const allNodesWithApi = [
    genericTopic,
    childSubclass,
    linkSubclass,
    standaloneTopic,
    standaloneLinkTopic,
    h4Topic,
    node('note:api', { role: 'INSTANCE', instanceKind: 'NOTE', name: 'api' }),
    node('para:1', {
      role: 'INSTANCE',
      instanceKind: 'PARAGRAPH',
      name: '인증',
      noteTitle: '인증노트',
    }),
  ];

  const edges = [edge('para:1', 'class:generic', 'INSTANCE_OF')];

  // 1. Generic topic '주제: api' -> title should strip prefix to 'api', has matching note
  const itemApi = buildTopicListItemData(genericTopic, allNodesWithApi, edges);
  assert.equal(itemApi.title, 'api');
  assert.equal(itemApi.keyword, 'api');
  assert.equal(itemApi.hasMatchingNote, true);
  assert.equal('subclassCount' in itemApi, false);
  assert.equal(itemApi.linkCount, 0);
  assert.equal(itemApi.paragraphCount, 1);
  assert.equal(itemApi.cardCount, 0);
  assert.equal(itemApi.sourceNoteCount, 1);
  assert.equal(itemApi.relatedTopicCount, 0);
  assert.equal(itemApi.relationCount, 2); // instance 1 + sourceNote 1
  assert.doesNotMatch(itemApi.subtitles[0], /실제 일반 노트 연결됨/);
  assert.doesNotMatch(itemApi.subtitles[0], /가상노트 도출됨/);
  assert.match(itemApi.subtitles[0], /링크 0 · 문단 1 · 카드 0 · 출처 노트 1 · 연관 주제 0/);
  assert.doesNotMatch(itemApi.subtitles[0], /하위 주제/);
  assert.equal(itemApi.link, undefined);

  // 2. Standalone topic 'H2 제목: 배포' -> title should strip prefix to '배포', has NO matching note
  const itemDeploy = buildTopicListItemData(standaloneTopic, allNodesWithApi, edges);
  assert.equal(itemDeploy.title, '배포');
  assert.equal(itemDeploy.keyword, '배포');
  assert.equal(itemDeploy.hasMatchingNote, false);
  assert.equal(itemDeploy.linkCount, 0);
  assert.equal(itemDeploy.relationCount, 0);
  assert.doesNotMatch(itemDeploy.subtitles[0], /실제 일반 노트 연결됨/);
  assert.doesNotMatch(itemDeploy.subtitles[0], /가상노트 도출됨/);
  assert.match(itemDeploy.subtitles[0], /링크 0 · 문단 0 · 카드 0 · 출처 노트 0 · 연관 주제 0/);
  assert.equal(itemDeploy.link, 'virtual');

  const itemStandaloneLink = buildTopicListItemData(standaloneLinkTopic, allNodesWithApi, edges);
  assert.equal(itemStandaloneLink.linkCount, 0);
  assert.match(itemStandaloneLink.subtitles[0], /링크 0/);

  const batchItems = buildTopicListItemsData(allNodesWithApi, edges);
  const batchApi = batchItems.find((item) => item.topicNode.id === genericTopic.id);
  assert.equal(batchApi.linkCount, itemApi.linkCount);
  assert.equal(batchApi.relatedTopicCount, itemApi.relatedTopicCount);
  assert.equal(
    batchItems.some((item) => item.topicNode.id === childSubclass.id),
    true
  );
  assert.equal(
    batchItems.some((item) => item.topicNode.id === linkSubclass.id),
    true
  );

  // 3. H4: prefix test
  const itemH4 = buildTopicListItemData(h4Topic, allNodesWithApi, edges);
  assert.equal(itemH4.title, 'typescript');
  assert.equal(itemH4.keyword, 'typescript');
});

test('builds a large topic list through shared indexes without repeated full recomputation', () => {
  const allNodes = [];
  const edges = [];
  const topicCount = 200;

  for (let topicIndex = 0; topicIndex < topicCount; topicIndex++) {
    const topicId = `class:topic:${topicIndex}`;
    allNodes.push(
      node(topicId, {
        role: 'CLASS',
        classCategory: 'TOPIC',
        name: `주제: topic-${topicIndex}`,
        matchLabel: `topic-${topicIndex}`,
      })
    );
    for (let instanceIndex = 0; instanceIndex < 5; instanceIndex++) {
      const instanceId = `paragraph:${topicIndex}:${instanceIndex}`;
      allNodes.push(
        node(instanceId, {
          instanceKind: 'PARAGRAPH',
          noteTitle: `note-${topicIndex}-${instanceIndex}`,
        })
      );
      edges.push(edge(instanceId, topicId, 'INSTANCE_OF'));
    }
  }

  const start = performance.now();
  const items = buildTopicListItemsData(allNodes, edges);
  const elapsed = performance.now() - start;

  assert.equal(items.length, topicCount);
  assert.ok(elapsed < 1000, `expected batch topic list below 1000ms, got ${elapsed.toFixed(1)}ms`);
});

test('topics are sorted by link, paragraph, card, and source-note totals, then title', () => {
  const topicA = {
    title: '알파',
    linkCount: 1,
    paragraphCount: 1,
    cardCount: 1,
    sourceNoteCount: 1,
  };
  const topicB = {
    title: '베타',
    linkCount: 2,
    paragraphCount: 0,
    cardCount: 0,
    sourceNoteCount: 3,
  };
  const topicC = {
    title: '감마',
    linkCount: 0,
    paragraphCount: 2,
    cardCount: 1,
    sourceNoteCount: 1,
  };
  const topicD = {
    title: '델타',
    linkCount: 0,
    paragraphCount: 0,
    cardCount: 0,
    sourceNoteCount: 0,
  };

  const sorted = [topicA, topicB, topicC, topicD].sort(compareTopicListItems);

  assert.deepEqual(
    sorted.map((t) => t.title),
    ['베타', '감마', '알파', '델타']
  );
});

test('getTopicVirtualNoteEligibleSet yields identical results to isTopicVirtualNoteEligible in fast O(N+E)', () => {
  const genericTopic = node('topic:react', {
    role: 'CLASS',
    type: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: React',
  });
  const subTopic = node('topic:hooks', {
    role: 'CLASS',
    type: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: Hooks',
  });
  const noteReact = node('note:react', {
    role: 'INSTANCE',
    type: 'INSTANCE',
    instanceKind: 'NOTE',
    name: 'React',
  });
  const cardNode = node('card:1', {
    role: 'INSTANCE',
    type: 'INSTANCE',
    instanceKind: 'CARD',
    name: 'Intro Card',
  });

  const allNodes = [genericTopic, subTopic, noteReact, cardNode];
  const edges = [edge(subTopic.id, genericTopic.id, 'SUBCLASS_OF')];

  const eligibleSet = getTopicVirtualNoteEligibleSet(allNodes, edges);

  for (const n of allNodes) {
    const singleResult = isTopicVirtualNoteEligible(n, edges, allNodes);
    assert.equal(
      eligibleSet.has(n.id),
      singleResult,
      `Node ${n.id} eligibility must match between batch and single check`
    );
  }
});
