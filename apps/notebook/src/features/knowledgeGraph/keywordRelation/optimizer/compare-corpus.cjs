/** Compare arbitrary complete runs using explicit source judgments; never embeds corpus answers. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { moduleLoader } = require('./run-corpus.cjs');
const normalize = (text) =>
  String(text || '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const identity = (o) =>
  JSON.stringify(
    ['noteTitle', 'section', 'origin', 'template', 'source', 'target', 'evidence'].map((k) =>
      normalize(o[k])
    )
  );
const pair = (o) =>
  JSON.stringify(['noteTitle', 'origin', 'source', 'target'].map((k) => normalize(o[k])));
const categories = new Set([
  'valid',
  'cooccurrence',
  'parse-error',
  'insufficient',
  'role-label-required',
]);
const labels = {
  valid: '원문상 타당',
  cooccurrence: '직접 관계 아님',
  'parse-error': '구조·추출 오류',
  insufficient: '문맥 부족',
  'role-label-required': '역할명 확인 필요',
};
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const ratio = (n, d) => (d ? n / d : null);
const count = (rows, key) =>
  rows.reduce((out, row) => {
    const k = key(row);
    out[k] = (out[k] || 0) + 1;
    return out;
  }, {});
function reviewIndex(files) {
  const index = new Map();
  for (const file of files)
    for (const row of read(file)) {
      const category = categories.has(row.category) ? row.category : row.judgment;
      if (!categories.has(category))
        throw new Error('Missing or invalid explicit source judgment in ' + file);
      const id = identity(row.observation);
      if (index.has(id) && index.get(id).category !== category)
        throw new Error('Conflicting source judgments for ' + row.observation.noteTitle);
      index.set(id, { ...row, category });
    }
  return index;
}
function metrics(rows, threshold) {
  const supported = rows.filter((row) => row.validation?.verdict === 'supported');
  const controls = rows.filter((row) => row.validation?.control?.scores);
  const valid = rows.filter((row) => row.category === 'valid');
  const supportedValid = supported.filter((row) => row.category === 'valid');
  return {
    total: rows.length,
    categories: count(rows, (row) => row.category),
    origins: count(rows, (row) => row.observation.origin),
    candidateValidity: ratio(valid.length, rows.length),
    supported: supported.length,
    supportedCategories: count(supported, (row) => row.category),
    supportedConfirmedValidity: ratio(supportedValid.length, supported.length),
    validCandidateAcceptance: ratio(supportedValid.length, valid.length),
    byOrigin: Object.fromEntries(
      [...new Set(rows.map((row) => row.observation.origin))].map((origin) => [
        origin,
        count(
          rows.filter((row) => row.observation.origin === origin),
          (row) => row.category
        ),
      ])
    ),
    supportedByOrigin: count(supported, (row) => row.observation.origin + ':' + row.category),
    basis: count(rows, (row) => row.validation?.basis || 'unavailable'),
    verdicts: count(rows, (row) => row.validation?.verdict || 'unverified'),
    controls: controls.length,
    rejectedControls: controls.filter((row) => row.validation.control.scores.entailment < threshold)
      .length,
  };
}
function topGroups(result, rows, limit, ranking) {
  const judgments = new Map(rows.map((row) => [identity(row.observation), row.category]));
  return result.candidates
    .map((candidate) => {
      const values = candidate.observations.map((o) => judgments.get(identity(o)));
      return {
        id: candidate.id,
        template: candidate.template,
        ...ranking.independentSupportRank(candidate.validations),
        observations: values.length,
        sourceAssessment: values.every((c) => c === 'valid')
          ? 'all-valid'
          : values.some((c) => c === 'valid')
          ? 'mixed'
          : 'none-confirmed-valid',
      };
    })
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        b.meanSupport - a.meanSupport ||
        b.supportCount - a.supportCount
    )
    .slice(0, limit);
}
function compare(beforeDir, afterDir, reviewFiles, output, options = {}) {
  beforeDir = path.resolve(beforeDir);
  afterDir = path.resolve(afterDir);
  output = path.resolve(output);
  const beforeManifest = read(path.join(beforeDir, 'manifest.json')),
    afterManifest = read(path.join(afterDir, 'manifest.json'));
  const beforeDigest = beforeManifest.portableNotebookDigest || beforeManifest.notebookDigest;
  const afterDigest = afterManifest.portableNotebookDigest || afterManifest.notebookDigest;
  if (!beforeDigest || beforeDigest !== afterDigest || beforeManifest.notes !== afterManifest.notes)
    throw new Error(
      'Notebook inputs differ; a controlled before/after comparison requires identical notes.'
    );
  const before = read(path.join(beforeDir, 'predictions.json')),
    after = read(path.join(afterDir, 'predictions.json'));
  if (before.length !== beforeManifest.observations || after.length !== afterManifest.observations)
    throw new Error('Manifest/prediction coverage differs.');
  const reviews = reviewIndex(reviewFiles);
  const missing = [...before, ...after].filter((row) => !reviews.has(identity(row.observation)));
  fs.mkdirSync(output, { recursive: true });
  const unresolved = [
    ...new Map(
      missing.map((row) => [
        identity(row.observation),
        { observation: row.observation, judgment: null },
      ])
    ).values(),
  ];
  write(path.join(output, 'unreviewed.json'), unresolved);
  if (unresolved.length)
    throw new Error(
      'Missing explicit source judgments: ' + unresolved.length + '. See unreviewed.json.'
    );
  const assess = (rows, prefix) =>
    rows.map((row, i) => {
      const review = reviews.get(identity(row.observation));
      return {
        ...row,
        id: prefix + String(i + 1).padStart(String(rows.length).length, '0'),
        category: review.category,
        reason: review.reason || '',
        reviewId: review.id,
        reviewMethod: 'exact-source-identity',
        sourceFile: options.notebookRoot
          ? path.join(path.resolve(options.notebookRoot), row.observation.noteTitle + '.md')
          : undefined,
      };
    });
  const beforeAssessed = assess(before, 'B'),
    afterAssessed = assess(after, 'A');
  const afterValid = new Set(
    afterAssessed.filter((row) => row.category === 'valid').map((row) => pair(row.observation))
  );
  const beforeValid = beforeAssessed.filter((row) => row.category === 'valid');
  const retained = beforeValid.filter((row) => afterValid.has(pair(row.observation)));
  const beforeIdentities = new Set(before.map((row) => identity(row.observation))),
    afterIdentities = new Set(after.map((row) => identity(row.observation)));
  const ranking = moduleLoader()(path.join(__dirname, 'validation.ts'));
  const threshold = ranking.DEFAULT_RELATION_POLICY.entailmentThreshold;
  const limit = options.topCount ?? 20;
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error('topCount must be a positive integer.');
  const beforeTop = topGroups(
    read(path.join(beforeDir, 'result.json')),
    beforeAssessed,
    limit,
    ranking
  );
  const afterTop = topGroups(
    read(path.join(afterDir, 'result.json')),
    afterAssessed,
    limit,
    ranking
  );
  const summary = {
    createdAt: new Date().toISOString(),
    notebookDigest: beforeDigest,
    sameNotebookDigest: true,
    notes: beforeManifest.notes,
    before: metrics(beforeAssessed, beforeManifest.policy?.entailmentThreshold ?? threshold),
    after: metrics(afterAssessed, afterManifest.policy?.entailmentThreshold ?? threshold),
    sourceCoverage: {
      before: before.length,
      after: after.length,
      unchangedSourceJudgments: after.filter((row) =>
        beforeIdentities.has(identity(row.observation))
      ).length,
      newOrChanged: after.filter((row) => !beforeIdentities.has(identity(row.observation))).length,
      missing: 0,
    },
    baselineValidRetentionByEndpointPair: {
      retained: retained.length,
      baseline: beforeValid.length,
      ratio: ratio(retained.length, beforeValid.length),
    },
    baselineValidRetentionIdenticalSource: beforeValid.filter((row) =>
      afterIdentities.has(identity(row.observation))
    ).length,
    execution: { before: beforeManifest, after: afterManifest },
    topGroups: {
      limit,
      before: beforeTop,
      after: afterTop,
      beforeAllValid: beforeTop.filter((row) => row.sourceAssessment === 'all-valid').length,
      afterAllValid: afterTop.filter((row) => row.sourceAssessment === 'all-valid').length,
    },
    sourceHashes: Object.fromEntries(
      fs
        .readdirSync(__dirname)
        .filter((name) => /\.(?:ts|tsx|cjs)$/.test(name))
        .map((name) => [
          name,
          createHash('sha256')
            .update(fs.readFileSync(path.join(__dirname, name)))
            .digest('hex'),
        ])
    ),
    interpretation: [
      'Candidate counts are observations, not distinct facts.',
      'Source judgments are supplied explicitly, not inferred from model scores.',
      'Insufficient context is neither confirmed valid nor known false.',
      'A single full run is not a repeated timing benchmark.',
      'Exact-source review reuse is retrospective, not independent holdout performance.',
    ],
  };
  write(path.join(output, 'before-assessed.json'), beforeAssessed);
  write(path.join(output, 'after-assessed.json'), afterAssessed);
  write(
    path.join(output, 'unretained-valid.json'),
    beforeValid.filter((row) => !afterValid.has(pair(row.observation)))
  );
  write(
    path.join(output, 'removed-or-changed.json'),
    beforeAssessed.filter((row) => !afterIdentities.has(identity(row.observation)))
  );
  write(path.join(output, 'comparison.json'), summary);
  fs.writeFileSync(
    path.join(output, 'comparison.html'),
    render(summary, beforeAssessed, afterAssessed)
  );
  return summary;
}
function escape(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
function render(summary, before, after) {
  const percent = (v) => (v == null ? '미측정' : (100 * v).toFixed(1) + '%');
  const lines = [
    ['원문 노트', summary.notes, summary.notes],
    ['관계 후보', summary.before.total, summary.after.total],
    ['원문상 타당', summary.before.categories.valid || 0, summary.after.categories.valid || 0],
    [
      '후보 타당 비율',
      percent(summary.before.candidateValidity),
      percent(summary.after.candidateValidity),
    ],
    [
      '구조·추출 오류',
      summary.before.categories['parse-error'] || 0,
      summary.after.categories['parse-error'] || 0,
    ],
    [
      '직접 관계 아님',
      summary.before.categories.cooccurrence || 0,
      summary.after.categories.cooccurrence || 0,
    ],
    [
      '문맥 부족',
      summary.before.categories.insufficient || 0,
      summary.after.categories.insufficient || 0,
    ],
    ['NLI 채택', summary.before.supported, summary.after.supported],
    [
      '채택 중 타당',
      summary.before.supportedCategories.valid || 0,
      summary.after.supportedCategories.valid || 0,
    ],
    [
      '채택 중 확인된 타당 비율',
      percent(summary.before.supportedConfirmedValidity),
      percent(summary.after.supportedConfirmedValidity),
    ],
    [
      '채택 중 직접 관계 아님',
      summary.before.supportedCategories.cooccurrence || 0,
      summary.after.supportedCategories.cooccurrence || 0,
    ],
    [
      '채택 중 구조·추출 오류',
      summary.before.supportedCategories['parse-error'] || 0,
      summary.after.supportedCategories['parse-error'] || 0,
    ],
    [
      '채택 중 문맥 부족',
      summary.before.supportedCategories.insufficient || 0,
      summary.after.supportedCategories.insufficient || 0,
    ],
    ['NLI 미검증', summary.before.verdicts.unverified || 0, summary.after.verdicts.unverified || 0],
    [
      '모델 입력 길이 초과',
      summary.execution.before.nliStats.oversizedInputs || 0,
      summary.execution.after.nliStats.oversizedInputs || 0,
    ],
    [
      '타당 후보의 NLI 채택률',
      percent(summary.before.validCandidateAcceptance),
      percent(summary.after.validCandidateAcceptance),
    ],
    [
      '최종 NLI 호출(대조 포함)',
      summary.execution.before.nliStats.validationChecks,
      summary.execution.after.nliStats.validationChecks,
    ],
    [
      '병합 NLI 호출',
      summary.execution.before.nliStats.mergeChecks,
      summary.execution.after.nliStats.mergeChecks,
    ],
    [
      '실행 시간(초)',
      summary.execution.before.elapsedSeconds.toFixed(1),
      summary.execution.after.elapsedSeconds.toFixed(1),
    ],
  ];
  const rows = lines
    .map(
      (cells) => '<tr>' + cells.map((cell) => '<td>' + escape(cell) + '</td>').join('') + '</tr>'
    )
    .join('');
  const cases = (data, side) =>
    data
      .map(
        (row) =>
          '<details class="case" id="' +
          side +
          '-' +
          row.id +
          '" data-side="' +
          side +
          '" data-category="' +
          row.category +
          '" data-verdict="' +
          escape(row.validation?.verdict) +
          '"><summary>' +
          escape(
            row.id +
              ' · ' +
              labels[row.category] +
              ' · ' +
              row.validation?.verdict +
              ' · ' +
              row.observation.source +
              ' → ' +
              row.observation.target
          ) +
          '</summary><p>' +
          escape(row.observation.noteTitle) +
          ' / ' +
          escape(row.observation.section) +
          '</p><p>' +
          escape(row.reason) +
          '</p><h4>원문 근거</h4><pre>' +
          escape(row.observation.evidence) +
          '</pre><h4>관계 표현</h4><pre>' +
          escape(row.observation.template) +
          '</pre><h4>검증 가설</h4><pre>' +
          escape(row.validation?.hypothesis) +
          '</pre><p>검증 방식: ' +
          escape(row.validation?.basis) +
          ' / 원래 점수: ' +
          escape(JSON.stringify(row.validation?.scores)) +
          '</p>' +
          (row.validation?.control
            ? '<h4>대체 검사</h4><pre>' +
              escape(row.validation.control.hypothesis) +
              '</pre><p>' +
              escape(JSON.stringify(row.validation.control.scores)) +
              '</p>'
            : '') +
          '</details>'
      )
      .join('');
  return (
    '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>하드코딩 제거 전후 전체 비교</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:1150px;margin:32px auto;padding:0 20px;color:#172033;background:#f7f9fc}table{border-collapse:collapse;background:white;width:100%}th,td{border:1px solid #ccd4e0;padding:9px;text-align:left}details{margin:8px 0;background:white;border:1px solid #ccd4e0;border-radius:6px;padding:12px}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#edf1f7;padding:12px}select,input{padding:10px;margin:4px;max-width:95%}.toolbar{position:sticky;top:0;background:#f7f9fc;padding:8px 0}h1{font-size:1.7rem}</style><h1>하드코딩 제거 전후 전체 비교</h1><p>동일한 ' +
    escape(summary.notes) +
    '개 노트 · 원문 해시 일치 · 전체 후보 판독 누락 ' +
    summary.sourceCoverage.missing +
    '건.</p><table><thead><tr><th>항목</th><th>제거 전</th><th>제거 후</th></tr></thead><tbody>' +
    rows +
    '</tbody></table><p>기존 타당 관찰의 끝점 대응 보존: ' +
    summary.baselineValidRetentionByEndpointPair.retained +
    '/' +
    summary.baselineValidRetentionByEndpointPair.baseline +
    ' (' +
    percent(summary.baselineValidRetentionByEndpointPair.ratio) +
    '). 같은 원문 판독 재사용 ' +
    summary.sourceCoverage.unchangedSourceJudgments +
    '건, 신규·변경 ' +
    summary.sourceCoverage.newOrChanged +
    '건.</p><p>문맥 부족은 거짓으로 확정하지 않는다. 모델 점수는 정답 확률이 아니다. 판독 재사용은 독립 검증이 아니며, 실행 시간은 모델 파일이 준비된 단일 실행의 측정값이다.</p><p><a href="comparison.json">비교 수치</a> · <a href="before-assessed.json">제거 전 전체 판독</a> · <a href="after-assessed.json">제거 후 전체 판독</a> · <a href="removed-or-changed.json">변경·보류된 후보</a></p><h2>전체 관계 결과</h2><div class="toolbar"><select id="side" aria-label="비교 시점"><option value="after">제거 후</option><option value="before">제거 전</option></select><select id="category" aria-label="원문 판독"><option value="">모든 원문 판독</option>' +
    Object.entries(labels)
      .map(([value, label]) => '<option value="' + value + '">' + label + '</option>')
      .join('') +
    '</select><select id="verdict" aria-label="NLI 판정"><option value="">모든 NLI 판정</option>' +
    [...new Set([...before, ...after].map((row) => row.validation?.verdict))]
      .map((value) => '<option>' + escape(value) + '</option>')
      .join('') +
    '</select><input id="query" aria-label="개체·근거·출처 검색" placeholder="개체·근거·출처 검색"><strong id="count"></strong></div>' +
    cases(after, 'after') +
    cases(before, 'before') +
    '<script>const controls=["side","category","verdict","query"].map(id=>document.getElementById(id));function filter(){const[s,c,v,q]=controls.map(x=>x.value);let visible=0,total=0;for(const row of document.querySelectorAll(".case")){if(row.dataset.side===s)total++;const show=row.dataset.side===s&&(!c||row.dataset.category===c)&&(!v||row.dataset.verdict===v)&&(!q||row.textContent.toLowerCase().includes(q.toLowerCase()));row.hidden=!show;if(show)visible++;}document.getElementById("count").textContent=visible+" / "+total+"건";}controls.forEach(x=>x.addEventListener("input",filter));filter();</script></html>'
  );
}
if (require.main === module) {
  try {
    const [before, after, reviews, output, newReviews] = process.argv.slice(2);
    if (!before || !after || !reviews || !output)
      throw new Error(
        'Usage: compare-corpus.cjs <before-run> <after-run> <review.json> <output-dir> [additional-review.json]'
      );
    const summary = compare(before, after, [reviews, ...(newReviews ? [newReviews] : [])], output);
    console.log(
      JSON.stringify(
        {
          notes: summary.notes,
          before: summary.before,
          after: summary.after,
          sourceCoverage: summary.sourceCoverage,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
module.exports = { compare, identity, metrics, reviewIndex };
