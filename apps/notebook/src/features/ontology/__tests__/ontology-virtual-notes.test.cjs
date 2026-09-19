const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'ontology-virtual-notes-'));
let isTopicVirtualNoteEligible;
let synthesizeTopicVirtualNote;
let extractTopicKeyword;
let isTopLevelTopicClass;
let findMatchingPhysicalNote;
let buildTopicListItemData;
let getTopicRelationCount;
let findRelatedTopics;
let topicNodeIdFromUrl;

try {
  for (const name of ['titleKeywordClasses', 'virtualNotes']) {
    const source = readFileSync(path.join(__dirname, '..', `${name}.ts`), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  ({
    isTopicVirtualNoteEligible,
    synthesizeTopicVirtualNote,
    extractTopicKeyword,
    isTopLevelTopicClass,
    findMatchingPhysicalNote,
    buildTopicListItemData,
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
      node('class:3', { role: 'CLASS', classCategory: 'TOPIC', name: '카드유형: 백엔드' })
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

test('isTopicVirtualNoteEligible returns false when a physical note with the same name exists', () => {
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
  assert.equal(isTopicVirtualNoteEligible(topicNode, edges, allNodesExact), false);

  // Case 2: Leaf path match (e.g. docs/backend/api)
  const allNodesLeaf = [
    topicNode,
    node('inst:note:leaf', { role: 'INSTANCE', instanceKind: 'NOTE', name: 'docs/backend/api' }),
  ];
  assert.equal(isTopicVirtualNoteEligible(topicNode, edges, allNodesLeaf), false);

  // Case 3: Case-insensitive match (API vs api)
  const allNodesCase = [
    topicNode,
    node('inst:note:upper', { role: 'INSTANCE', instanceKind: 'NOTE', name: 'API' }),
  ];
  assert.equal(isTopicVirtualNoteEligible(topicNode, edges, allNodesCase), false);
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

test('isTopicVirtualNoteEligible returns false for subordinate classes that have a parent subclass', () => {
  const topicNode = node('class:topic:api', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: api',
    matchLabel: 'api',
  });

  const subClassNode = node('class:sub:api', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: 'H2 제목: api',
    matchLabel: 'api',
  });

  const edges = [edge('class:sub:api', 'class:topic:api', 'SUBCLASS_OF')];

  const allNodes = [topicNode, subClassNode];

  // Subclass has outgoing SUBCLASS_OF edge, so it should NOT be eligible independently
  assert.equal(isTopicVirtualNoteEligible(subClassNode, edges, allNodes), false);
  // Topic superclass has no outgoing SUBCLASS_OF edge, so it IS eligible
  assert.equal(isTopicVirtualNoteEligible(topicNode, edges, allNodes), true);
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

test('synthesizeTopicVirtualNote aggregates subclasses, paragraphs and cards into structured markdown', () => {
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

  const cardSubclass = node('class:sub:cardType', {
    role: 'CLASS',
    classKind: 'TITLE_KEYWORD',
    classCategory: 'TOPIC',
    name: '카드유형: 백엔드',
    matchLabel: '백엔드',
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

  const allNodes = [topicNode, headerSubclass, cardSubclass, paraInst1, paraInst2, cardInst];

  const edges = [
    edge(headerSubclass.id, topicNode.id, 'SUBCLASS_OF'),
    edge(cardSubclass.id, topicNode.id, 'SUBCLASS_OF'),
    edge(paraInst1.id, headerSubclass.id, 'INSTANCE_OF'),
    edge(paraInst2.id, headerSubclass.id, 'INSTANCE_OF'),
    edge(cardInst.id, cardSubclass.id, 'INSTANCE_OF'),
  ];

  const virtualNote = synthesizeTopicVirtualNote(topicNode, allNodes, edges);

  assert.equal(virtualNote.topicKeyword, 'api');
  assert.equal(virtualNote.title, 'api');
  assert.equal(virtualNote.subclassCount, 2);
  assert.equal(virtualNote.paragraphCount, 2);
  assert.equal(virtualNote.cardCount, 1);
  assert.equal(virtualNote.relatedTopicCount, 0);
  assert.deepEqual(
    virtualNote.sourceNoteTitles.sort(),
    ['Sprint 1/In Progress', '클라이언트 개발', '아키텍처'].sort()
  );

  // Check Markdown content
  assert.match(virtualNote.content, /# 🪐 \[가상노트\] api/);
  assert.match(virtualNote.content, /## 🗂️ 주제 색인/);
  assert.match(virtualNote.content, /하위 분류 \(2\)\*\*:/);
  assert.match(virtualNote.content, /종합 문단 \(2\)\*\*:/);
  assert.match(virtualNote.content, /종합 카드 \(1\)\*\*:/);
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

  assert.match(virtualNote.content, /종합 문단 \(1\)/);
  assert.doesNotMatch(virtualNote.content, /직접 연관 지식|Directly Related Knowledge/);
});

test('adds related-topic links only when shared knowledge plus source notes totals at least three', () => {
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
    noteTitle: '공유 노트',
    name: '공유 문단',
  });
  const sharedRealInstance = node('paragraph:shared-real', {
    instanceKind: 'PARAGRAPH',
    noteTitle: '공유 노트',
    name: '다른 공유 문단',
  });
  const sharedThresholdInstance = node('paragraph:shared-threshold', {
    instanceKind: 'PARAGRAPH',
    noteTitle: '공유 노트',
    name: '공유 보조 문단',
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
  assert.match(topicListItem.subtitles[0], /연관 주제 2/);
  assert.match(virtualNote.content, /ontologyTopic=class%3Atopic%3Avirtual/);
  assert.match(virtualNote.content, /title=%EC%8B%A4%EC%A0%9C%EC%97%B0%EA%B4%80/);
  assert.doesNotMatch(virtualNote.content, /근거부족/);
  assert.equal(
    topicNodeIdFromUrl(
      'https://blacktokki.local/?ontologyTopic=class%3Atopic%3Avirtual&title=virtual'
    ),
    'class:topic:virtual'
  );
});

test('isTopLevelTopicClass correctly filters top-level and standalone topic classes', () => {
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

  const edges = [edge('class:child', 'class:generic', 'SUBCLASS_OF')];

  assert.equal(isTopLevelTopicClass(genericTopic, edges), true);
  assert.equal(isTopLevelTopicClass(standaloneTopic, edges), true);
  assert.equal(isTopLevelTopicClass(childSubclass, edges), false);
  assert.equal(isTopLevelTopicClass(builtInClass, edges), false);
});

test('findMatchingPhysicalNote finds notes by exact, leaf, and case-insensitive matching', () => {
  const allNodes = [
    node('note:1', { role: 'INSTANCE', instanceKind: 'NOTE', name: 'api' }),
    node('note:2', { role: 'INSTANCE', instanceKind: 'NOTE', name: 'docs/guide/architecture' }),
  ];

  assert.equal(findMatchingPhysicalNote('api', allNodes)?.id, 'note:1');
  assert.equal(findMatchingPhysicalNote('API', allNodes)?.id, 'note:1');
  assert.equal(findMatchingPhysicalNote('architecture', allNodes)?.id, 'note:2');
  assert.equal(findMatchingPhysicalNote('unknown', allNodes), undefined);
});

test('buildTopicListItemData formats items for NoteListSection with correct connection state', () => {
  const genericTopic = node('class:generic', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: '주제: api',
    matchLabel: 'api',
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
  const h4Topic = node('class:ts', {
    role: 'CLASS',
    classCategory: 'TOPIC',
    name: 'H4: typescript',
  });

  const allNodesWithApi = [
    genericTopic,
    childSubclass,
    standaloneTopic,
    h4Topic,
    node('note:api', { role: 'INSTANCE', instanceKind: 'NOTE', name: 'api' }),
    node('para:1', {
      role: 'INSTANCE',
      instanceKind: 'PARAGRAPH',
      name: '인증',
      noteTitle: '인증노트',
    }),
  ];

  const edges = [
    edge('class:child', 'class:generic', 'SUBCLASS_OF'),
    edge('para:1', 'class:child', 'INSTANCE_OF'),
  ];

  // 1. Generic topic '주제: api' -> title should strip prefix to 'api', has matching note
  const itemApi = buildTopicListItemData(genericTopic, allNodesWithApi, edges);
  assert.equal(itemApi.title, 'api');
  assert.equal(itemApi.keyword, 'api');
  assert.equal(itemApi.hasMatchingNote, true);
  assert.equal(itemApi.subclassCount, 1);
  assert.equal(itemApi.paragraphCount, 1);
  assert.equal(itemApi.cardCount, 0);
  assert.equal(itemApi.sourceNoteCount, 1);
  assert.equal(itemApi.relatedTopicCount, 0);
  assert.equal(itemApi.relationCount, 3); // subclass 1 + instance 1 + sourceNote 1
  assert.doesNotMatch(itemApi.subtitles[0], /실제 일반 노트 연결됨/);
  assert.doesNotMatch(itemApi.subtitles[0], /가상노트 도출됨/);
  assert.match(itemApi.subtitles[0], /하위 분류 1 · 문단 1 · 카드 0 · 출처 노트 1 · 연관 주제 0/);
  assert.equal(itemApi.link, undefined);

  // 2. Standalone topic 'H2 제목: 배포' -> title should strip prefix to '배포', has NO matching note
  const itemDeploy = buildTopicListItemData(standaloneTopic, allNodesWithApi, edges);
  assert.equal(itemDeploy.title, '배포');
  assert.equal(itemDeploy.keyword, '배포');
  assert.equal(itemDeploy.hasMatchingNote, false);
  assert.equal(itemDeploy.relationCount, 0);
  assert.doesNotMatch(itemDeploy.subtitles[0], /실제 일반 노트 연결됨/);
  assert.doesNotMatch(itemDeploy.subtitles[0], /가상노트 도출됨/);
  assert.match(
    itemDeploy.subtitles[0],
    /하위 분류 0 · 문단 0 · 카드 0 · 출처 노트 0 · 연관 주제 0/
  );
  assert.equal(itemDeploy.link, 'virtual');

  // 3. H4: prefix test
  const itemH4 = buildTopicListItemData(h4Topic, allNodesWithApi, edges);
  assert.equal(itemH4.title, 'typescript');
  assert.equal(itemH4.keyword, 'typescript');
});

test('topics are sorted by relationCount descending then by title ascending', () => {
  const topicA = { title: '알파', relationCount: 2 };
  const topicB = { title: '베타', relationCount: 5 };
  const topicC = { title: '감마', relationCount: 5 };
  const topicD = { title: '델타', relationCount: 0 };

  const list = [topicA, topicB, topicC, topicD];
  const sorted = [...list].sort((a, b) => {
    if (b.relationCount !== a.relationCount) {
      return b.relationCount - a.relationCount;
    }
    return a.title.localeCompare(b.title);
  });

  // Highest relation count first: '감마' (5) and '베타' (5) -> alphabetical: '감마', then '베타'
  // Next: '알파' (2)
  // Last: '델타' (0)
  assert.deepEqual(
    sorted.map((t) => t.title),
    ['감마', '베타', '알파', '델타']
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
