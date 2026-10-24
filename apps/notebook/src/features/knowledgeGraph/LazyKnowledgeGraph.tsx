import React, { Suspense, lazy } from 'react';

import LoadingView from '../../components/LoadingView';

type KnowledgeGraph = typeof import('./index');
let runtime: Promise<KnowledgeGraph> | undefined;
// Keep one async entry: Metro moves dependencies shared by async chunks into the initial bundle.
const loadKnowledgeGraph = () => (runtime ??= import('./index'));

function deferred<Props extends object>(
  select: (module: KnowledgeGraph) => React.ComponentType<Props>,
  fallback: React.ReactNode = null
) {
  const Component = lazy(async () => ({ default: select(await loadKnowledgeGraph()) }));
  return function DeferredKnowledgeGraph(props: Props) {
    return (
      <Suspense fallback={fallback}>
        <Component {...props} />
      </Suspense>
    );
  };
}

export const KnowledgeGraphScreen = deferred(
  (module) => module.KnowledgeGraphScreen,
  <LoadingView />
);
export const RelationAnalysisScreen = deferred(
  (module) => module.RelationAnalysisScreen,
  <LoadingView />
);
export const GraphSearchSection = deferred((module) => module.GraphSearchSection, <LoadingView />);
export const KnowledgeGraphButton = deferred((module) => module.KnowledgeGraphButton);
export const RelationAnalysisBackground = deferred((module) => module.RelationAnalysisBackground);
