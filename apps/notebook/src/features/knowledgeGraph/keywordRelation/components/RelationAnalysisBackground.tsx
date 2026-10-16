import React, { useEffect, useRef } from 'react';

import { GraphSearchEmbeddingBackground } from '../search/GraphSearchEmbeddingBackground';
import { useRelationAnalysis } from '../useRelationAnalysis';
import { useRelationAnalysisNotes } from '../useRelationAnalysisNotes';
import {
  clearRelationAnalysisSession,
  publishRelationAnalysisSession,
} from '../useRelationAnalysisSession';

/** Mounted once by the background extension slot; observers never start their own jobs. */
export function RelationAnalysisBackground() {
  const owner = useRef({}).current;
  const data = useRelationAnalysisNotes();
  const analysis = useRelationAnalysis({
    scope: data.scope,
    notes: data.notes.data,
    active: data.available && !data.notes.isError,
    refreshing: data.notes.isFetching,
  });
  useEffect(() => () => clearRelationAnalysisSession(data.scope, owner), [data.scope, owner]);
  useEffect(() => {
    publishRelationAnalysisSession(data.scope, owner, { data, analysis });
  }, [data, analysis, owner]);
  return <GraphSearchEmbeddingBackground />;
}
