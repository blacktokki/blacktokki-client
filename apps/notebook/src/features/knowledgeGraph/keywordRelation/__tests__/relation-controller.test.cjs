const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

describe('Analysis controller lifecycle', () => {
  const { hookHarness } = require('./loadTs.cjs');
  const loadTs = require('./loadTs.cjs');

  function workspace() {
    const harness = hookHarness();
    const calls = [];
    const clears = [];
    const props = {
      scope: 'local:1:normal',
      active: true,
      notes: [{ title: 'One', description: 'body' }],
      refreshing: false,
    };
    const { useRelationAnalysis } = loadTs('useRelationAnalysis.ts', {
      react: harness.react,
      './types': loadTs('types.ts'),
      './relationAnalysis': {
        clearRelationAnalysisMemory: (scope) => clears.push(scope),
        inspectRelationAnalysisCache: (notes, options) =>
          new Promise((resolve, reject) =>
            calls.push({ notes, options, resolve, reject, cacheCheck: true })
          ),
        runInductiveRelationAnalysis: (notes, options) =>
          new Promise((resolve, reject) => calls.push({ notes, options, resolve, reject })),
      },
    });
    return {
      calls,
      clears,
      props,
      render: () => harness.render(() => useRelationAnalysis(props)),
      unmount: harness.unmount,
    };
  }

  const settled = () => new Promise((resolve) => setImmediate(resolve));

  test('changing the structure language cancels stale work and checks a separate pattern cache', () => {
    const workspaceState = workspace();
    const ko = require('../../../../lang/ko.json');
    workspaceState.props.translate = (value) => ko[value] || value;
    workspaceState.render();
    const koreanCall = workspaceState.calls[0];
    assert.equal(koreanCall.cacheCheck, true);
    assert.ok(koreanCall.options.scope.includes('리스트'));
    workspaceState.props.translate = (value) => value;
    workspaceState.render();
    const englishCall = workspaceState.calls[1];
    assert.equal(koreanCall.options.signal.aborted, true);
    assert.notEqual(koreanCall.options.scope, englishCall.options.scope);
    assert.ok(englishCall.options.scope.includes('List'));
    assert.ok(workspaceState.clears.includes(koreanCall.options.scope));
    workspaceState.unmount();
  });

  function preparation() {
    return {
      noteCount: 1,
      entityCount: 0,
      observationCount: 0,
      candidates: [],
      warnings: [],
      patternCache: { status: 'missing', hasEvaluations: false },
    };
  }

  function collection() {
    return {
      ...analysis(''),
      candidates: [],
      entityExtraction: {
        status: 'completed',
        noteCount: 3,
        inputCount: 2,
        mentionCount: 4,
        entities: [{ text: 'React Native', type: 'KEYWORD', noteCount: 3, mentionCount: 4 }],
      },
      inputPatterns: [
        {
          label: 'uses',
          template: '{{E1}} uses {{E2}}',
          origin: 'sentence',
          sourceType: 'KEYWORD',
          targetType: 'KEYWORD',
          observationCount: 1,
          noteSupport: 1,
          pairSupport: 1,
        },
      ],
    };
  }

  async function prepare(screen) {
    screen.render();
    const call = screen.calls.at(-1);
    assert.equal(call.cacheCheck, true);
    call.resolve(preparation());
    await settled();
    assert.equal(screen.render().status, 'ready');
  }

  test('entry automatically checks the cache and waits for explicit analysis before collecting', async (t) => {
    const logs = [];
    t.mock.method(console, 'log', (...args) => logs.push(args));
    const screen = workspace();
    screen.render();
    assert.equal(screen.calls.length, 1);
    assert.equal(screen.render().status, 'running');
    assert.equal(screen.render().prepareOnly, true);
    const automatic = screen.calls[0];
    assert.equal(automatic.cacheCheck, true);
    assert.deepEqual(Object.keys(automatic.options).sort(), ['onCacheProgress', 'scope', 'signal']);
    const prepared = preparation();
    automatic.resolve(prepared);
    await settled();
    let state = screen.render();
    assert.equal(state.status, 'ready');
    assert.equal(state.entities, undefined);
    assert.equal(state.patterns, undefined);
    assert.equal(state.result, undefined);
    assert.equal(state.total, 0);
    assert.equal(state.phase, 'checking');
    assert.equal(state.processed, 0);
    assert.equal(state.elapsedMs, 0);
    assert.equal(logs.length, 0, 'preparation updates state without a separate log');
    screen.render();
    assert.equal(screen.calls.length, 1, 'a missing cache must wait for explicit analysis');
    state.start();
    const analysisCall = screen.calls[1];
    assert.equal(analysisCall.cacheCheck, undefined);
    const { relationAnalysisDisplay } = loadTs('useRelationAnalysis.ts');
    assert.equal(relationAnalysisDisplay(screen.render()).ratio, 2 / 9);
    const collected = collection();
    collected.entityExtraction.entities.push(
      ...['React', '서울역', '서울시청', '서울버스'].map((text) => ({
        text,
        type: 'KEYWORD',
        noteCount: 3,
        mentionCount: 4,
      }))
    );
    collected.entityExtraction.inputCount = 5;
    collected.entityExtraction.mentionCount = 20;
    analysisCall.options.onEntities(collected.entityExtraction);
    assert.equal(logs.length, 1, 'keyword and composition summaries share one log');
    assert.equal(logs[0][1].고유개체수, 5);
    assert.ok(logs[0][1].개체목록.some((item) => item.개체 === 'React Native'));
    assert.ok(
      logs[0][1].복합키워드목록.some(
        (item) => item.키워드 === 'react native' && item.포함키워드.includes('react')
      )
    );
    assert.deepEqual(logs[0][1].구성키워드목록, [
      { 키워드: '서울', 발견횟수: 3, 합성키워드목록: ['서울버스', '서울시청', '서울역'] },
    ]);
    assert.equal(logs[0][1].복합키워드수, logs[0][1].복합키워드목록.length);
    assert.equal(logs[0][1].구성키워드수, 1);
    analysisCall.options.onEntityTypes(collected.entityExtraction);
    analysisCall.options.onPatterns(collected.inputPatterns);
    analysisCall.options.onInferenceProgress({
      model: 'statistics',
      phase: 'association',
      unit: 'context',
      total: 201,
      processed: 200,
      elapsedMs: 400,
    });
    state = screen.render();
    assert.equal(state.phase, 'association');
    assert.equal(state.prepareOnly, false);
    assert.equal(state.processed, 200);
    assert.equal(state.entities, collected.entityExtraction);
    assert.equal(state.patterns, collected.inputPatterns);
    analysisCall.options.onInferenceProgress({
      phase: 'association',
      stage: 'completion',
      processed: 201,
      total: 201,
      elapsedMs: 450,
    });
    assert.equal(screen.render().processed, 201);
    assert.equal(logs.length, 4, 'completion updates state without a separate log');
    const result = analysis('uses');
    const candidate = result.candidates[0];
    candidate.observations = Array.from({ length: 5 }, (_, index) => ({
      ...candidate.observations[0],
      evidence: `Evidence ${index + 1}`,
    }));
    candidate.measurements = candidate.observations.map(({ evidence }) => ({
      ...candidate.measurements[0],
      evidence,
    }));
    const original = structuredClone(result);
    analysisCall.resolve(result);
    await settled();
    assert.equal(screen.render().status, 'completed');
    assert.equal(screen.render().result, result);
    assert.equal(screen.calls.length, 2);
    assert.deepEqual(result, original);
    assert.deepEqual(
      logs.map(([title]) => title),
      [
        '1. 키워드 개체 추출 요약',
        '2. 키워드 개수 일치 열거 수집',
        '3. 수집된 개체 유형',
        '4. 연관관계 후보 묶음',
        '5. 연관관계 분석 결과',
      ]
    );
    assert.equal(
      logs[4][1].관계후보[0].관찰근거[0].원문,
      result.candidates[0].observations[0].evidence
    );
    assert.deepEqual(logs[4][1].관계후보[0].평가결과[0].연관성, { 문맥: 'sentence', 점수: 0.72 });
    assert.equal(logs[4][1].관계후보[0].관찰근거.length, 5);
    assert.equal(logs[4][1].관계후보[0].평가결과.length, 5);
    assert.equal(logs[4][1].관계후보[0].관찰근거[4].원문, 'Evidence 5');
    assert.equal(logs[4][1].candidates, undefined);
  });

  test('Korean diagnostics retain all nested values and keyword identities from extracted results', async () => {
    const { discoverKeywordAssociations } = loadTs.keywordHarness();
    const result = await discoverKeywordAssociations(
      ['One', 'Two', 'Three'].map((title) => ({
        title,
        description:
          '# Tools\n- **text**\n- **sources**\n- **details**\n\n**text** uses **sources**.\n\nLang: **details**\n\n' +
          '| Name | Value |\n| --- | --- |\n| **text** | **sources** |',
      }))
    );
    const original = JSON.stringify(result);
    const originalDetails = result.entityExtraction.details;
    const { localizeRelationLog } = loadTs('useRelationAnalysis.ts', {}, ['localizeRelationLog']);
    const log = localizeRelationLog(result);
    const values = (value) => {
      if (Array.isArray(value)) return value.map(values);
      if (value && typeof value === 'object') return Object.values(value).map(values);
      return value;
    };
    const checkKeys = (value, dictionary = false) => {
      if (Array.isArray(value)) return value.forEach((entry) => checkKeys(entry));
      if (!value || typeof value !== 'object') return;
      for (const [key, entry] of Object.entries(value)) {
        if (!dictionary) assert.match(key, /[가-힣]/, key);
        checkKeys(entry, !dictionary && key === '개체별상세');
      }
    };
    checkKeys(log);
    assert.deepEqual(values(log), values(result));
    assert.equal(JSON.stringify(result), original);
    assert.equal(result.entityExtraction.details, originalDetails);
    assert.deepEqual(
      Object.keys(log.키워드개체추출.개체별상세),
      Object.keys(result.entityExtraction.details)
    );
    for (const key of ['text', 'sources', 'details'])
      assert.ok(log.키워드개체추출.개체별상세[key].출처목록.length > 0);
    assert.ok(log.키워드개체추출.개체유형목록.length > 0);
  });

  test('compatible cache headers restore candidates and proceed directly to evaluation', async (t) => {
    t.mock.method(console, 'log', () => {});
    const screen = workspace();
    screen.render();
    assert.equal(screen.calls[0].cacheCheck, true);
    const { relationAnalysisDisplay } = loadTs('useRelationAnalysis.ts');
    const overall = [];
    const observe = () => {
      const state = screen.render();
      const ratio = relationAnalysisDisplay(state).ratio;
      overall.push(ratio);
      return ratio;
    };
    assert.equal(observe(), 0);
    for (const processed of [1, 2, 3]) {
      screen.calls[0].options.onCacheProgress({
        phase: 'checking',
        processed,
        total: 3,
        ratio: processed / 3,
      });
      assert.equal(observe(), processed / 3 / 9);
    }
    screen.calls[0].resolve({
      ...preparation(),
      patternCache: { status: 'reusable', hasEvaluations: false },
    });
    await settled();
    const ready = screen.render();
    assert.equal(ready.status, 'ready');
    assert.equal(ready.entities, undefined);
    assert.equal(ready.patterns, undefined);
    assert.equal(ready.total, 3);
    assert.equal(screen.calls.length, 2, 'a valid cache needs no reuse button');
    const analysisCall = screen.calls[1];
    assert.equal(analysisCall.cacheCheck, undefined);
    assert.equal(analysisCall.options.cachePolicy, 'reuse');
    assert.equal(relationAnalysisDisplay(ready).phaseLabel, 'Cache reusable');
    assert.equal(relationAnalysisDisplay(ready).ratio, 1 / 9);
    assert.equal(screen.render().phase, 'restoring');
    assert.equal(observe(), 1 / 9, 'automatic restoration retains completed cache checking');
    for (const processed of [0, 1, 2, 3, 4, 5]) {
      analysisCall.options.onCacheProgress({
        phase: 'restoring',
        processed,
        total: 5,
        ratio: processed / 5,
      });
      assert.equal(observe(), (1 + processed / 5) / 9);
    }
    const restored = collection();
    for (const [callback, result] of [
      ['onEntities', restored.entityExtraction],
      ['onEntityTypes', restored.entityExtraction],
      ['onPatterns', restored.inputPatterns],
    ]) {
      analysisCall.options[callback](result);
      assert.equal(observe(), 2 / 9, 'publishing saved collections cannot replay earlier stages');
      assert.equal(screen.render().phase, 'restoring');
    }
    analysisCall.options.onInferenceProgress({
      phase: 'association',
      stage: 'evaluation',
      processed: 1,
      total: 3,
      elapsedMs: 10,
    });
    assert.equal(screen.render().phase, 'association');
    assert.equal(screen.render().prepareOnly, false);
    assert.equal(observe(), (7 + 1 / 3) / 9);
    analysisCall.resolve({ ...analysis('cached'), cacheRestored: true });
    await settled();
    assert.equal(screen.render().status, 'completed');
    assert.equal(observe(), 8 / 9);
    assert.ok(overall.every((ratio, index) => !index || ratio >= overall[index - 1]));
    assert.equal(screen.calls.length, 2);
    screen.unmount();
  });

  test('stop suppresses late statistical progress and resumes analysis only on request', async (t) => {
    t.mock.method(console, 'log', () => {});
    const screen = workspace();
    await prepare(screen);
    screen.render().start();
    const call = screen.calls[1];
    call.options.onInferenceProgress({
      model: 'statistics',
      phase: 'association',
      unit: 'context',
      total: 600,
      processed: 400,
      elapsedMs: 100,
    });
    screen.render().stop();
    assert.equal(call.options.signal.aborted, true);
    assert.equal(screen.render().status, 'stopping');
    call.options.onInferenceProgress({
      phase: 'association',
      total: 600,
      processed: 500,
    });
    call.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    await settled();
    assert.equal(screen.render().status, 'cancelled');
    assert.equal(screen.render().processed, 400);
    screen.props.refreshing = true;
    screen.render();
    screen.props.refreshing = false;
    screen.render();
    assert.equal(screen.calls.length, 2);
    screen.render().start();
    assert.equal(screen.calls[2].cacheCheck, undefined);
    screen.calls[2].resolve(analysis('resumed'));
    await settled();
    assert.equal(screen.render().status, 'completed');
  });

  test('scope changes automatically prepare the new scope while disabled and unmounted screens suppress old callbacks', async (t) => {
    const logs = [];
    t.mock.method(console, 'log', (...args) => logs.push(args));
    const screen = workspace();
    screen.props.scope = 'local:1:private';
    await prepare(screen);
    screen.render().start();
    logs.length = 0;
    const privateCall = screen.calls[1];
    screen.props.scope = 'local:2:normal';
    screen.render();
    assert.equal(privateCall.options.signal.aborted, true);
    assert.deepEqual(screen.clears, ['local:1:private']);
    assert.equal(screen.calls[2].cacheCheck, true);
    privateCall.options.onPatterns([]);
    privateCall.resolve(analysis('private'));
    await settled();
    assert.equal(screen.render().result, undefined);
    assert.equal(logs.length, 0);
    screen.props.active = false;
    screen.render();
    assert.equal(screen.render().status, 'idle');
    assert.equal(screen.calls[2].options.signal.aborted, true);
    screen.render().start();
    assert.equal(screen.calls.length, 3);
    screen.props.active = true;
    screen.render();
    assert.equal(screen.calls.length, 4);
    screen.unmount();
    assert.equal(screen.calls[3].options.signal.aborted, true);
    assert.equal(screen.clears.at(-1), 'local:2:normal');
    screen.calls[2].resolve(preparation());
    screen.calls[3].resolve(preparation());
    await settled();
    assert.equal(logs.length, 0);
  });

  function analysis(label) {
    return {
      noteCount: 1,
      entityCount: 2,
      observationCount: 1,
      warnings: [],
      candidates: [
        {
          id: 'candidate',
          label,
          noteSupport: 1,
          pairSupport: 1,
          observations: [
            {
              noteTitle: 'One',
              section: '활동',
              source: '민수',
              target: '서울대학교',
              sourceType: 'PER',
              targetType: 'ORG',
              origin: 'sentence',
              evidence: '민수는 서울대학교에서 일한다.',
            },
          ],
          measurements: [
            {
              noteTitle: 'One',
              evidence: '민수는 서울대학교에서 일한다.',
              association: { context: 'sentence', score: 0.72 },
            },
          ],
        },
      ],
    };
  }
});

describe('Notebook scope and observers', () => {
  const loadTs = require('./loadTs.cjs');

  function source({
    requested = true,
    metadataOnly = false,
    focused = true,
    local = true,
    userId,
    notebookId = 7,
    privateMode = false,
    privacyLoading = false,
    usageMode = 'NOTEBOOK',
  } = {}) {
    const queries = [];
    const reads = [];
    const useQuery = (query) => {
      const view = {
        ...query,
        queryFn: async () => {
          const result = await query.queryFn();
          return query.select ? query.select(result) : result;
        },
      };
      queries.push(view);
      return view;
    };
    const { useRelationAnalysisNotes, useRelationAnalysisScope } = loadTs(
      'useRelationAnalysisSession.ts',
      {
        '@blacktokki/account': {
          useAuthContext: () => ({
            auth: { isLocal: local, user: userId ? { id: userId } : null },
          }),
        },
        '@react-navigation/native': { useIsFocused: () => focused },
        react: { useEffect: () => {}, useCallback: (value) => value },
        '../../../hooks/usePrivate': {
          usePrivate: () => ({ data: { enabled: privateMode }, isLoading: privacyLoading }),
          isHiddenTitle: (title) => title.startsWith('.') || title.includes('/.'),
        },
        '../../../hooks/useUsageMode': {
          useUsageMode: () => ({ usageMode, notebook: { id: notebookId, title: 'Notebook' } }),
        },
        '../../../hooks/useNoteStorage': loadTs.noteSourceHarness({
          local,
          userId,
          notebookId,
          usageMode,
          useQuery,
          read: async (request) => {
            reads.push(request);
            return [
              { type: 'NOTE', title: 'Z', description: '<b>React Native</b>', updated: 'unused' },
              { type: 'NOTE', title: '.Hidden', description: 'private' },
              { type: 'NOTE', title: 'A', description: 'body' },
              { type: 'NOTE', title: 'Nested/.Hidden', description: 'private' },
              { type: 'NOTE', title: 'Empty', description: '  ' },
              { type: 'NOTEBOOK', title: 'Container', description: 'metadata' },
            ];
          },
        }),
      }
    );
    const data = metadataOnly
      ? useRelationAnalysisScope(requested)
      : useRelationAnalysisNotes(requested);
    return { ...data, queries, reads };
  }

  test('relation sources select only visible note text with stable title order', async () => {
    const data = source();
    assert.equal(data.queries.length, 1);
    assert.deepEqual(data.notes.queryKey, ['pageContents', false, 'NOTEBOOK', 7, null]);
    assert.deepEqual(await data.notes.queryFn(), [
      { title: 'A', description: 'body' },
      { title: 'Z', description: '<b>React Native</b>' },
    ]);
    assert.deepEqual(data.reads, [{ isOnline: false, types: ['NOTE'], parentId: 7 }]);
    const privateData = source({ privateMode: true });
    assert.equal((await privateData.notes.queryFn()).length, 4);
  });

  test('feature queries isolate accounts, notebooks and privacy with standard storage subkeys', () => {
    const scopes = [
      source(),
      source({ notebookId: 8 }),
      source({ privateMode: true }),
      source({ local: false, userId: 1 }),
      source({ local: false, userId: 2 }),
    ];
    assert.equal(new Set(scopes.map((item) => item.scope)).size, 5);
    assert.equal(new Set(scopes.map((item) => JSON.stringify(item.notes.queryKey))).size, 4);
    assert.deepEqual(
      scopes[0].notes.queryKey,
      scopes[2].notes.queryKey,
      'privacy selectors share source I/O, not analysis results'
    );
    assert.equal(scopes[2].scope, ':7:private');
    assert.equal(scopes[3].scope, '1:7:normal');
    assert.equal(source({ notebookId: 0, usageMode: 'NOTE' }).scope, ':0:normal');
    assert.ok(scopes.every((item) => item.reads.length === 0));
  });

  test('disabled, simple-mode, unresolved privacy and unauthenticated sessions cannot fetch sources', () => {
    for (const options of [
      { requested: false },
      { usageMode: 'SIMPLE' },
      { privacyLoading: true },
      { local: false },
    ]) {
      const data = source(options);
      assert.equal(data.notes.enabled, false);
      assert.equal(data.reads.length, 0);
      assert.equal(data.available, false);
    }
  });

  test('enabled extension sources are available without a focused analysis screen', () => {
    const data = source({ focused: false });
    assert.equal(data.available, true);
    assert.equal(data.notes.enabled, true);
  });

  test('session observers resolve the same access scope without querying note contents', () => {
    const data = source({ metadataOnly: true, focused: false, privateMode: true });
    assert.equal(data.scope, ':7:private');
    assert.equal(data.available, true);
    assert.equal(data.queries.length, 0);
    assert.equal(data.reads.length, 0);
  });

  test('consumers mounted after analysis reuse one read while refresh and invalidation load changes', async (t) => {
    const { QueryClient, QueryObserver } = require('react-query/core');
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, cacheTime: Infinity } },
    });
    const observers = [];
    const useQuery = (options) => {
      const observer = new QueryObserver(client, options);
      const unsubscribe = observer.subscribe(() => {});
      observers.push({ observer, options, unsubscribe });
      return observer.getCurrentResult();
    };
    t.after(() => {
      for (const { unsubscribe } of observers) unsubscribe();
      client.clear();
    });
    let reads = 0;
    let privateMode = false;
    let rows = [
      { type: 'NOTE', title: 'One', description: 'body', updated: '2026' },
      { type: 'NOTE', title: '.Hidden', description: 'secret', updated: '2026' },
      { type: 'NOTE', title: 'Empty', description: ' ', updated: '2026' },
    ];
    const noteStorage = loadTs.noteSourceHarness({
      useQuery,
      read: async () => {
        reads++;
        return structuredClone(rows);
      },
    });
    const dependencies = {
      react: { useEffect: () => {}, useCallback: (value) => value },
      'react-query': { useQuery },
      '@react-navigation/native': {},
      '@blacktokki/account': {
        useAuthContext: () => ({ auth: { isLocal: true, user: null } }),
      },
      '../../../hooks/useNoteStorage': noteStorage,
      '../../../hooks/usePrivate': {
        usePrivate: () => ({ data: { enabled: privateMode }, isLoading: false }),
        isHiddenTitle: (title) => title.startsWith('.'),
      },
      '../../../hooks/useUsageMode': {
        useUsageMode: () => ({ usageMode: 'NOTEBOOK', notebook: { id: 7 } }),
      },
    };
    const { useRelationAnalysisNotes } = loadTs('useRelationAnalysisSession.ts', dependencies);
    const templateHooks = loadTs.hookHarness();
    t.after(templateHooks.unmount);
    const { useInductiveTemplatesData } = loadTs(
      '../../inductiveTemplate/useInductiveTemplates.ts',
      {
        ...dependencies,
        react: templateHooks.react,
        '../../hooks/useNoteStorage': noteStorage,
        '../../hooks/usePrivate': dependencies['../../../hooks/usePrivate'],
        '../../hooks/useUsageMode': dependencies['../../../hooks/useUsageMode'],
        '../../services/storage': { getStorageConfig: async () => ({ pathName: 'Folder' }) },
        './template': { templateScope: (...parts) => JSON.stringify(parts) },
      }
    );
    useRelationAnalysisNotes();
    const relation = observers[0];
    await client.fetchQuery(relation.options.queryKey, relation.options.queryFn, {
      staleTime: relation.options.staleTime,
    });
    const original = relation.observer.getCurrentResult().data;
    assert.deepEqual(original, [{ title: 'One', description: 'body' }]);
    assert.equal(reads, 1);

    // Search and template preparation mount after the original source read has finished.
    noteStorage.useNotePages();
    const general = observers.at(-1);
    templateHooks.render(() => useInductiveTemplatesData(true, true));
    const template = observers.at(-1);
    privateMode = true;
    useRelationAnalysisNotes();
    const privateRelation = observers.at(-1);
    await new Promise(setImmediate);
    assert.equal(reads, 1, 'later observers must not replay a completed file scan');
    assert.equal(template.observer.getCurrentResult().data.length, 1);
    assert.equal(privateRelation.observer.getCurrentResult().data.length, 2);
    assert.equal(general.observer.getCurrentResult().data.length, 3);
    assert.equal(relation.options.refetchInterval, false);
    assert.equal(template.options.refetchInterval, false);

    rows = rows.map((row) => (row.title === 'One' ? { ...row, description: 'changed' } : row));
    await general.observer.refetch();
    assert.equal(reads, 2, 'manual refresh must read current files');
    const changed = relation.observer.getCurrentResult().data;
    assert.deepEqual(changed, [{ title: 'One', description: 'changed' }]);
    assert.notEqual(changed, original);
    assert.equal(template.observer.getCurrentResult().data[0].description, 'changed');
    await general.observer.refetch();
    assert.equal(reads, 3);
    assert.equal(
      relation.observer.getCurrentResult().data,
      changed,
      'unchanged source refresh must retain the analysis input identity'
    );

    await client.invalidateQueries(['pageContents']);
    assert.equal(reads, 4, 'one invalidation must share a single read across active observers');
    assert.equal(relation.observer.getCurrentResult().data, changed);

    client.setQueryData(relation.options.queryKey, client.getQueryData(relation.options.queryKey), {
      updatedAt: Date.now() - relation.options.staleTime - 1,
    });
    noteStorage.useNotePages();
    await client.fetchQuery(relation.options.queryKey, relation.options.queryFn, {
      staleTime: relation.options.staleTime,
    });
    assert.equal(reads, 5, 'mounting with an expired source snapshot must check current files');
  });
});

test('analysis entry observes prepared sources without a second read and refreshes when returning', () => {
  const load = require('./loadTs.cjs');
  const harness = load.hookHarness();
  let focused = true;
  let reads = 0;
  const data = {
    scope: 'local:7:normal',
    available: true,
    notes: { isFetching: true, refetch: () => reads++ },
  };
  const { RelationAnalysisScreen } = load('screens/RelationAnalysisScreens.tsx', {
    react: harness.react,
    '@blacktokki/core': { useLangContext: () => ({ lang: (key) => key }) },
    '@react-navigation/native': { useIsFocused: () => focused },
    'react-native': { View: 'View' },
    '../../../../hooks/useExtension': {
      useEffectExtensionScreen: () => ({ isActive: true, isReady: true }),
    },
    '../../../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ commonStyles: {} }) },
    '../../../../components/LoadingView': {},
    '../../../../components/SearchBar': {},
    '../../components/KnowledgeGraphNavToolbar': {},
    '../components/AnalysisControls': {},
    '../styles': {},
    './AnalysisProgressSection': {},
    './RelationResultsSection': {},
    '../useRelationAnalysisSession': { useRelationAnalysisSession: () => ({ data, analysis: {} }) },
  });
  const render = () => harness.render(RelationAnalysisScreen);
  render();
  data.notes.isFetching = false;
  render();
  assert.equal(reads, 0, 'initial loading and already prepared sources use the background query');
  focused = false;
  render();
  focused = true;
  render();
  assert.equal(reads, 1, 'returning from a source note still checks for edits');
  render();
  assert.equal(reads, 1);
  data.scope = 'local:8:normal';
  render();
  assert.equal(reads, 1, 'the new scoped background query owns initial loading');
  harness.unmount();
});

test('one status covers cache readiness and all analysis stages while progress and refresh remain accurate', () => {
  const load = require('./loadTs.cjs');
  const { hookHarness, elements } = load;
  const harness = hookHarness();
  const status = load('useRelationAnalysis.ts');
  const analysis = {
    ...load('types.ts').initialRelationAnalysisState(),
    runId: 7,
    status: 'running',
    prepareOnly: false,
    phase: 'keywords',
    processed: 3,
    total: 10,
  };
  let embedding = { analysisRunId: 7, phase: 'idle', processed: 0, total: 0 };
  let loading = false;
  const { AnalysisProgressSection } = load('screens/AnalysisProgressSection.tsx', {
    react: harness.react,
    '@blacktokki/core': { useLangContext: () => ({ lang: (key) => key }) },
    'react-native': { View: 'View', Text: 'Text' },
    'react-native-paper': { ProgressBar: 'Progress' },
    '../../../../hooks/useNotebookTheme': {
      useNotebookTheme: () => ({ commonStyles: { button: {} } }),
    },
    '../components/AnalysisControls': { AnalysisAction: 'Action' },
    '../styles': { relationAnalysisStyles: {} },
    '../useRelationAnalysis': {
      ...status,
      useSearchEmbeddingStatus: (_, source) =>
        source === 'extension' ? embedding : { phase: 'idle' },
    },
  });
  const render = () =>
    elements(
      harness.render(() =>
        AnalysisProgressSection({
          analysis,
          scope: 'notes',
          noteCount: 3,
          ready: true,
          loading,
        })
      )
    );
  const checkStatus = (label, tree = render()) => {
    const statusText = tree.filter((node) => node.props.testID === 'relation-analysis-status');
    assert.equal(statusText.length, 1);
    assert.equal(statusText[0].props.children.join(''), label);
    assert.equal(statusText[0].props.accessibilityLiveRegion, 'polite');
    assert.ok(!tree.some((node) => node.props.testID === 'relation-pattern-cache'));
    assert.ok(!tree.some((node) => node.props.testID === 'relation-pattern-cache-status'));
    assert.equal(tree.filter((node) => node.props.accessibilityLiveRegion).length, 1);
  };
  const check = (ratio, stageIndeterminate, disabled, label) => {
    const tree = render();
    if (label) checkStatus(label, tree);
    const bar = tree.find((node) => node.type === 'Progress');
    assert.equal(bar.props.progress, ratio);
    assert.equal(bar.props.indeterminate, false, 'the bar always represents overall progress');
    assert.equal(
      tree.find((node) => node.props.label === 'Refresh notes').props.disabled,
      disabled
    );
    assert.deepEqual(bar.props.accessibilityValue, {
      min: 0,
      max: 100,
      now: Math.floor(ratio * 100),
    });
    assert.equal(
      tree.some(
        (node) =>
          node.type === 'Text' &&
          node.props.children.flat(Infinity).join('') === 'Stage progress: —'
      ),
      stageIndeterminate
    );
  };
  for (const [index, [phase, label]] of [
    ['checking', 'Checking relationship cache'],
    ['restoring', 'Restoring cached relationships'],
    ['keywords', 'Extracting entity keywords'],
    ['types', 'Collecting entity types'],
    ['contexts', 'Collecting source contexts'],
    ['candidates', 'Collecting relationship candidates'],
    ['grouping', 'Grouping relationship candidates'],
    ['association', 'Evaluating associations'],
  ].entries()) {
    analysis.phase = phase;
    check((index + 0.3) / 9, false, true, label);
    analysis.stageProgress = 1;
    check((index + 1) / 9, false, true, label);
    delete analysis.stageProgress;
  }
  analysis.phase = 'types';
  analysis.total = 0;
  check(3 / 9, false, true);
  analysis.stageProgress = 0.45;
  check(3.45 / 9, false, true);
  analysis.status = 'completed';
  check(8 / 9, true, true, 'Checking search cache');
  embedding = { ...embedding, phase: 'checking' };
  check(8 / 9, true, true, 'Checking search cache');
  const checking = render()
    .filter((node) => node.type === 'Text')
    .map((node) => node.props.children.flat(Infinity).join(''));
  assert.ok(checking.includes('Checking search cache'));
  assert.ok(!checking.includes('Checking relationship cache'));
  assert.ok(checking.includes('Stage progress: —'));
  assert.ok(checking.every((label) => !label.includes('0.0%')));
  embedding = { ...embedding, phase: 'running', processed: 1, total: 4, stageProgress: 0.8 };
  check(8.8 / 9, false, true, 'Preparing search embeddings');
  embedding = { ...embedding, phase: 'completed', processed: 4 };
  check(1, false, false, 'Analysis complete');
  embedding = { ...embedding, analysisRunId: 6 };
  check(8 / 9, true, true, 'Checking search cache');
  embedding = { ...embedding, analysisRunId: 7, phase: 'failed', processed: 1 };
  check(8.8 / 9, false, false, 'Search embeddings failed');
  embedding = { ...embedding, phase: 'running', processed: 4, stageProgress: 0.9999999 };
  const unfinished = render();
  assert.ok(unfinished.find((node) => node.type === 'Progress').props.progress < 1);
  const labels = unfinished
    .filter((node) => node.type === 'Text')
    .map((node) => node.props.children.flat(Infinity).join(''));
  assert.ok(labels.includes('Overall progress: 99.9%'));
  assert.ok(labels.every((label) => !label.includes('100.0%')));
  embedding = { ...embedding, phase: 'completed' };
  check(1, false, false, 'Analysis complete');
  analysis.status = 'ready';
  analysis.prepareOnly = true;
  analysis.phase = 'checking';
  analysis.stageProgress = 1;
  for (const [status, label] of [
    ['missing', 'Cache creation required'],
    ['outdated', 'Cache update required'],
    ['unavailable', 'Cache check unavailable'],
    ['reusable', 'Cache reusable'],
  ]) {
    analysis.patternCache = { status, hasEvaluations: false };
    check(1 / 9, false, false, label);
  }
  loading = true;
  checkStatus('Checking relationship cache');
  analysis.status = 'idle';
  embedding = { phase: 'idle', processed: 0, total: 0 };
  const initial = render();
  checkStatus('Checking relationship cache', initial);
  assert.ok(!initial.some((node) => node.type === 'Progress'));
  loading = false;
  analysis.status = 'running';
  delete analysis.stageProgress;
  check(0, true, true, 'Checking relationship cache');
  analysis.prepareOnly = false;
  analysis.phase = 'restoring';
  check(1 / 9, true, true, 'Restoring cached relationships');
  for (const [status, label] of [
    ['stopping', 'Saving completed results'],
    ['cancelled', 'Analysis stopped'],
    ['failed', 'Analysis needs attention'],
  ]) {
    analysis.status = status;
    checkStatus(label);
  }
  const restoreSequence = [
    status.relationAnalysisDisplay({
      ...analysis,
      status: 'running',
      phase: 'checking',
      prepareOnly: true,
    }),
    status.relationAnalysisDisplay({ ...analysis, status: 'running', phase: 'restoring' }),
    status.relationAnalysisDisplay(
      { ...analysis, status: 'completed' },
      { analysisRunId: 7, phase: 'checking', processed: 0, total: 0 }
    ),
  ].map((display) => display.phaseLabel);
  assert.deepEqual(restoreSequence, [
    'Checking relationship cache',
    'Restoring cached relationships',
    'Checking search cache',
  ]);
});
