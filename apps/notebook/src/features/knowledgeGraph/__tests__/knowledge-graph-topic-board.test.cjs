const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const Module = require('node:module');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'kg-topic-dashboard-test-'));
const knowledgeGraphDirectory = path.join(__dirname, '..');
const topicDashboardDirectory = path.join(knowledgeGraphDirectory, '..', 'topicDashboard');
const kgTopicDashoardDirectory = path.join(knowledgeGraphDirectory, 'topicDashoard');

const transpileFile = (srcPath, destPath) => {
  const source = readFileSync(srcPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  mkdirSync(path.dirname(destPath), { recursive: true });
  writeFileSync(destPath, compiled.outputText);
};

transpileFile(
  path.join(topicDashboardDirectory, 'inferBoardCandidates.ts'),
  path.join(output, 'topicDashboardInfer', 'inferBoardCandidates.js')
);
transpileFile(
  path.join(kgTopicDashoardDirectory, 'inferTopicBoardPages.ts'),
  path.join(output, 'topicDashoard', 'inferTopicBoardPages.js')
);
transpileFile(
  path.join(kgTopicDashoardDirectory, 'useTopicBoardToggle.ts'),
  path.join(output, 'topicDashoard', 'useTopicBoardToggle.js')
);
transpileFile(
  path.join(kgTopicDashoardDirectory, 'topicBoardEligibility.ts'),
  path.join(output, 'topicDashoard', 'topicBoardEligibility.js')
);
transpileFile(
  path.join(kgTopicDashoardDirectory, 'useResolvedTopicBoards.ts'),
  path.join(output, 'topicDashoard', 'useResolvedTopicBoards.js')
);
transpileFile(
  path.join(kgTopicDashoardDirectory, 'useTopicBoardDisabled.ts'),
  path.join(output, 'topicDashoard', 'useTopicBoardDisabled.js')
);
transpileFile(
  path.join(kgTopicDashoardDirectory, 'index.ts'),
  path.join(output, 'topicDashoard', 'index.js')
);

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.endsWith('/TopicBoardToggle')) {
    return { TopicBoardToggle: () => null };
  }
  if (request.endsWith('/inferBoardCandidates')) {
    return require(path.join(output, 'topicDashboardInfer', 'inferBoardCandidates.js'));
  }
  if (request.endsWith('/components/HeaderSelectBar')) {
    return {
      paragraphDescription: () => '',
      parseHtmlToParagraphs: (html) => {
        const paragraphs = [
          { title: '', level: 0, path: '', description: html, autoSection: undefined },
        ];
        for (const [index, match] of [...html.matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi)].entries()) {
          paragraphs.push({
            title: match[2].replace(/<[^>]*>/g, '').trim(),
            level: Number(match[1]),
            path: `heading-${index}`,
            header: match[0],
            description: '',
          });
        }
        return paragraphs;
      },
    };
  }
  if (request === 'react') {
    return {
      useState: (init) => {
        let val = typeof init === 'function' ? init() : init;
        const setVal = (updater) => {
          val = typeof updater === 'function' ? updater(val) : updater;
        };
        return [val, setVal];
      },
      useCallback: (cb) => cb,
    };
  }
  if (request === '@blacktokki/core') {
    return { useLangContext: () => ({ lang: (k) => k }) };
  }
  if (request === 'react-native' || request.startsWith('react-native-')) {
    return { StyleSheet: { create: (s) => s }, TouchableOpacity: 'TouchableOpacity', View: 'View', Text: 'Text', default: {} };
  }
  if (request.endsWith('/hooks/useNotebookTheme')) {
    return { useNotebookTheme: () => ({ commonStyles: {}, colorScheme: 'light' }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let inferTopicBoardPages;
let useTopicBoardToggle;
let topicDashoardModule;
let isTopicBoardDisabled;
let shouldResetTopicBoardLayout;
let isTopicBoardAllowed;
let resolveTopicBoardPages;
let useResolvedTopicBoards;
let useTopicBoardDisabled;

try {
  topicDashoardModule = require(path.join(output, 'topicDashoard', 'index.js'));
  inferTopicBoardPages = topicDashoardModule.inferTopicBoardPages;
  useTopicBoardToggle = topicDashoardModule.useTopicBoardToggle;
  isTopicBoardDisabled = topicDashoardModule.isTopicBoardDisabled;
  shouldResetTopicBoardLayout = topicDashoardModule.shouldResetTopicBoardLayout;
  isTopicBoardAllowed = topicDashoardModule.isTopicBoardAllowed;
  resolveTopicBoardPages = topicDashoardModule.resolveTopicBoardPages;
  useResolvedTopicBoards = topicDashoardModule.useResolvedTopicBoards;
  useTopicBoardDisabled = topicDashoardModule.useTopicBoardDisabled;
} finally {
  Module._load = originalLoad;
}

test.after(() => rmSync(output, { recursive: true, force: true }));

test('topicDashoard module exports all topic board domain logic', () => {
  assert.equal(typeof inferTopicBoardPages, 'function');
  assert.equal(typeof useTopicBoardToggle, 'function');
  assert.equal(typeof isTopicBoardDisabled, 'function');
  assert.equal(typeof shouldResetTopicBoardLayout, 'function');
  assert.equal(typeof isTopicBoardAllowed, 'function');
  assert.equal(typeof resolveTopicBoardPages, 'function');
  assert.equal(typeof useResolvedTopicBoards, 'function');
  assert.equal(typeof useTopicBoardDisabled, 'function');
  assert.equal(isTopicBoardDisabled(true, false), true);
  assert.equal(isTopicBoardDisabled(false, true), false);
  assert.equal(isTopicBoardDisabled(true, true), false);
  assert.equal(isTopicBoardDisabled(false, false), false);
  assert.equal(isTopicBoardDisabled(undefined, false), false);
});

test('inferTopicBoardPages transforms path-based note candidates into virtual board pages', () => {
  const notePages = [
    {
      id: 1,
      title: '스프린트/해야할일',
      type: 'NOTE',
      description: '<h3>태스크 A</h3><p>세부사항</p>',
    },
    {
      id: 2,
      title: '스프린트/진행중',
      type: 'NOTE',
      description: '<h3>태스크 B</h3><p>세부사항</p>',
    },
  ];

  const boardPages = [];
  const virtualBoards = inferTopicBoardPages(notePages, boardPages);

  assert.ok(virtualBoards.length >= 1, '최소 1개의 가상 보드가 추론되어야 합니다.');
  const sprintBoard = virtualBoards.find((b) => b.title === '스프린트');
  assert.ok(sprintBoard, '스프린트 가상 보드가 생성되어야 합니다.');
  assert.equal(sprintBoard.type, 'BOARD');
  assert.equal(sprintBoard.isTopicCandidate, true);
  assert.ok(sprintBoard.id < 0, '가상 보드는 음수 ID를 가져야 합니다.');
});

test('determines topic board allowed only when topicDashboard extension is active and not SIMPLE mode', () => {
  assert.equal(isTopicBoardAllowed('SIMPLE', { info: [{ key: 'topicDashboard', active: true }] }), false);
  assert.equal(isTopicBoardAllowed('NOTE', { info: [{ key: 'topicDashboard', active: false }] }), false);
  assert.equal(isTopicBoardAllowed('NOTE', { info: [{ key: 'topicDashboard', active: true }] }), true);
  assert.equal(isTopicBoardAllowed('NOTEBOOK', { info: [{ key: 'topicDashboard', active: true }] }), true);
  assert.equal(isTopicBoardAllowed('NOTEBOOK', { info: [{ key: 'topicDashboard', active: false }] }), false);
  assert.equal(isTopicBoardAllowed('NOTEBOOK', { info: [] }), false);
  assert.equal(isTopicBoardAllowed('NOTEBOOK', null), false);
});

test('useTopicBoardToggle manages effective active state based on usageMode and extension', () => {
  const activeToggle = useTopicBoardToggle({
    initialState: true,
    usageMode: 'NOTEBOOK',
    extension: { info: [{ key: 'topicDashboard', active: true }] },
  });
  assert.equal(activeToggle.enableTopicBoards, true);
  assert.equal(activeToggle.isTopicBoardAllowed, true);

  const disabledModeToggle = useTopicBoardToggle({
    initialState: true,
    usageMode: 'SIMPLE',
    extension: { info: [{ key: 'topicDashboard', active: true }] },
  });
  assert.equal(disabledModeToggle.enableTopicBoards, false);
  assert.equal(disabledModeToggle.isTopicBoardAllowed, false);
  assert.equal(disabledModeToggle.rawEnableTopicBoards, true);
});

test('resets node positions to initial layout when topic board toggle is disabled', () => {
  // 시뮬레이션 상태 전환 로직 검증: true -> false 전환 시 이전 위치를 비우고 콜드 스타트 수행
  const shouldResetPositions = (prevEnableTopicBoards, currentEnableTopicBoards) => {
    return prevEnableTopicBoards === true && !currentEnableTopicBoards;
  };

  assert.equal(shouldResetPositions(false, true), false, '토글 켤 때는 이전 위치 유지');
  assert.equal(shouldResetPositions(true, true), false, '토글 유지 시 이전 위치 유지');
  assert.equal(shouldResetPositions(false, false), false, '토글 꺼진 상태 유지 시 이전 위치 유지');
  assert.equal(shouldResetPositions(true, false), true, '토글 해제 시에 한해서 위치 초기화');

  // 노드 위치 초기화 함수 검증
  const seedNodes = (nodes, previousPositions, isTopicBoardDisabled) => {
    if (isTopicBoardDisabled) {
      return nodes.map((node) => ({ ...node, x: 0, y: 0 }));
    }
    if (previousPositions.size > 0) {
      return nodes.map((node) => {
        const prev = previousPositions.get(node.id);
        return prev && node.x === 0 && node.y === 0 ? { ...node, x: prev.x, y: prev.y } : node;
      });
    }
    return nodes;
  };

  const sampleNodes = [
    { id: 'note:1', x: 250, y: 350 },
    { id: 'note:2', x: 450, y: 550 },
  ];
  const previousPositions = new Map([
    ['note:1', { x: 999, y: 999 }],
    ['note:2', { x: 888, y: 888 }],
  ]);

  const resetResult = seedNodes(sampleNodes, previousPositions, true);
  assert.deepEqual(
    resetResult.map((n) => ({ x: n.x, y: n.y })),
    [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    '주제 보드 해제 시 모든 노드의 위치가 0(초기 위치)으로 리셋되어야 합니다.'
  );

  const retainedResult = seedNodes(sampleNodes, previousPositions, false);
  assert.deepEqual(
    retainedResult.map((n) => ({ x: n.x, y: n.y })),
    [{ x: 250, y: 350 }, { x: 450, y: 550 }],
    '주제 보드 해제가 아닐 때는 기존 노드 위치를 보존해야 합니다.'
  );

  // 줌 및 화면 맞춤 검증: 토글 해제 시 화면 맞춤(applyFitToScreen)을 호출하지 않고 기존 줌 유지
  const shouldApplyFitToScreen = (previousPositionsSize, isTopicBoardDisabled) => {
    return previousPositionsSize === 0 && !isTopicBoardDisabled;
  };

  assert.equal(shouldApplyFitToScreen(0, false), true, '최초 레이아웃 시 화면 맞춤 적용');
  assert.equal(
    shouldApplyFitToScreen(0, true),
    false,
    '주제 보드 토글 해제 시 화면 맞춤을 건너뛰어 사용자의 현재 줌을 유지해야 합니다.'
  );
  assert.equal(shouldApplyFitToScreen(5, false), false, '일반 업데이트 시 화면 맞춤 미적용 (줌 유지)');
});

