/** Measure wall time, including pending work, without retaining note or query contents. */
import type { GraphSearchCacheReadTiming } from '../types';

export const searchDiagnosticTime = () => globalThis.performance?.now() ?? Date.now();

type Status = '완료' | '실패' | '중단';
type Detail = string | number | boolean | undefined;
let sequence = 0;
const relationTimings = new Map<string, Record<string, Detail>>();

/** Localized analysis scopes wrap the same account/notebook/privacy scope used by search. */
function diagnosticScope(scope: string) {
  try {
    const value = JSON.parse(scope);
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  } catch {}
  return scope;
}

export function recordRelationCacheTiming(scope: string, values: Record<string, Detail>) {
  const key = diagnosticScope(scope);
  relationTimings.delete(key);
  relationTimings.set(key, { ...values });
  if (relationTimings.size > 8) relationTimings.delete(relationTimings.keys().next().value!);
}

export const readRelationCacheTiming = (scope: string) => ({
  ...relationTimings.get(diagnosticScope(scope)),
});

export function clearRelationCacheTiming(scope?: string) {
  if (scope === undefined) relationTimings.clear();
  else relationTimings.delete(diagnosticScope(scope));
}

export function createSearchDiagnostic(
  label: string | undefined,
  details: Record<string, Detail>,
  startedAt = searchDiagnosticTime()
) {
  const id = ++sequence;
  const steps = new Map<string, { start: number; end?: number; status?: Status }>();
  let closed = false;
  const milliseconds = (value: number) => Math.max(0, Math.round(value));
  const snapshot = (status: Status) => {
    const now = searchDiagnosticTime();
    console.log(label, {
      ...details,
      측정ID: id,
      상태: status,
      경과ms: milliseconds(now - startedAt),
      '5초초과': now - startedAt >= 5000,
      진행중: [...steps].filter(([, step]) => step.end === undefined).map(([name]) => name),
      작업시간: Object.fromEntries(
        [...steps].map(([name, step]) => [
          name,
          {
            시작ms: Math.round(step.start - startedAt),
            경과ms: milliseconds((step.end ?? now) - step.start),
            상태: step.status ?? '진행 중',
          },
        ])
      ),
      로그시간: new Date().toISOString(),
    });
  };
  const begin = (name: string, at = searchDiagnosticTime()) => {
    const step: { start: number; end?: number; status?: Status } = { start: at };
    steps.set(name, step);
    return (status: Status = '완료') => {
      if (step.end !== undefined || closed) return;
      step.end = searchDiagnosticTime();
      step.status = status;
    };
  };
  return {
    get closed() {
      return closed;
    },
    update: (values: Record<string, Detail>) => {
      Object.assign(details, values);
    },
    readTiming: (): GraphSearchCacheReadTiming => ({
      details: { ...details },
      steps: [...steps].map(([name, step]) => ({ name, ...step })),
    }),
    record: (timing: GraphSearchCacheReadTiming) => {
      if (closed) return;
      Object.assign(details, timing.details);
      if (timing.reused !== undefined) details.저장소조회재사용 = timing.reused;
      for (const { name, ...step } of timing.steps) steps.set(name, step);
    },
    begin,
    measure: async <T>(name: string, work: () => T | Promise<T>) => {
      const end = begin(name);
      try {
        const value = await work();
        end();
        return value;
      } catch (error) {
        end('실패');
        throw error;
      }
    },
    sync: <T>(name: string, work: () => T) => {
      const end = begin(name);
      try {
        const value = work();
        end();
        return value;
      } catch (error) {
        end('실패');
        throw error;
      }
    },
    finish: (status: Status) => {
      if (closed) return;
      if (label) snapshot(status);
      closed = true;
    },
  };
}

export type SearchDiagnostic = ReturnType<typeof createSearchDiagnostic>;
