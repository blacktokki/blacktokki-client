import { useLangContext } from '@blacktokki/core';
import { toHtml } from '@blacktokki/editor';
import { useEffect, useMemo, useState } from 'react';

import { addTemplateGraph, templateGraphNeighbors } from './graph';
import { getKnowledgeGraphPalette } from './palette';
import { nextTemplateGraphMode, TemplateGraphMode } from './types';
import { useExtension } from '../../../hooks/useExtension';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { discoverTemplates } from '../../inductiveTemplate/discovery';
import {
  groupSimilarTemplates,
  SimilarTemplateGroup,
} from '../../inductiveTemplate/templateSimilarity';
import { useInductiveTemplates } from '../../inductiveTemplate/useInductiveTemplates';
import { KnowledgeGraphData } from '../types';

export function useTemplateGraph(graph: KnowledgeGraphData) {
  const { data: extension } = useExtension();
  const available = !!extension.info.find(
    (item) => item.key === 'inductiveTemplate' && item.active
  );
  const data = useInductiveTemplates(available);
  const { lang } = useLangContext();
  const { colorScheme } = useNotebookTheme();
  const [selection, setSelection] = useState<{ scope: string; mode: TemplateGraphMode }>({
    scope: data.scope,
    mode: 'off',
  });
  const mode = available && selection.scope === data.scope ? selection.mode : 'off';
  const dateLabel = lang('Date');
  const [result, setResult] = useState<{
    scope: string;
    mode: TemplateGraphMode;
    examples: typeof data.examples.data;
    roots: string[];
    dateLabel: string;
    groups: SimilarTemplateGroup[];
    error: boolean;
  }>();
  useEffect(() => {
    setSelection({ scope: data.scope, mode: 'off' });
    setResult(undefined);
  }, [available, data.scope]);
  useEffect(() => {
    if (mode === 'off' || !data.enabled || !data.examples.data || data.examples.isError) return;
    const examples = data.examples.data;
    const timer = setTimeout(() => {
      let groups: SimilarTemplateGroup[] = [];
      let error = false;
      try {
        groups = groupSimilarTemplates(
          discoverTemplates(examples, dateLabel, data.notebookRoots, mode),
          toHtml
        );
      } catch {
        error = true;
      }
      setResult({
        scope: data.scope,
        mode,
        examples,
        roots: data.notebookRoots,
        dateLabel,
        groups,
        error,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [
    mode,
    data.scope,
    data.enabled,
    data.examples.data,
    data.examples.isError,
    data.notebookRoots,
    dateLabel,
  ]);
  // The base graph polls current notes. Refresh the scoped template sources when it changes too.
  const { refetch } = data.examples;
  useEffect(() => {
    if (available && mode !== 'off' && data.enabled) refetch();
  }, [graph.nodes, available, mode, data.enabled, refetch]);
  const current =
    mode !== 'off' &&
    result?.scope === data.scope &&
    result.mode === mode &&
    result.examples === data.examples.data &&
    result.roots === data.notebookRoots &&
    result.dateLabel === dateLabel;
  const error = mode !== 'off' && (data.examples.isError || (current && result.error));
  const working = mode !== 'off' && !error && (!current || data.examples.isFetching);
  const augmented = useMemo(
    () =>
      current && !error
        ? addTemplateGraph(
            graph,
            result.groups,
            getKnowledgeGraphPalette(colorScheme === 'dark'),
            lang('Template group')
          )
        : graph,
    [graph.nodes, graph.edges, current, error, result, colorScheme, lang]
  );
  const getNeighbors = useMemo(() => templateGraphNeighbors(augmented.edges), [augmented.edges]);
  return {
    ...augmented,
    getNeighbors,
    available,
    mode,
    working,
    error: !!error,
    count: current ? result.groups.reduce((count, group) => count + group.templates.length, 0) : 0,
    toggle: () => setSelection({ scope: data.scope, mode: nextTemplateGraphMode(mode) }),
  };
}
