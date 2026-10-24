import { QueryClient } from 'react-query';

import { features } from '../../hooks/useExtension';

type FocusSection = (typeof features)['focus']['NotePageSections'][number];

let globalQueryClient: QueryClient | null = null;
let isFocus = false;

export const setGlobalQueryClient = (qc: QueryClient) => {
  globalQueryClient = qc;
};

export const getIsFocus = () => isFocus;

export const setFocusModeState = (
  val: boolean,
  queryClient?: QueryClient,
  section?: FocusSection
) => {
  const qc = queryClient || globalQueryClient;
  if (isFocus !== val) {
    isFocus = val;
    if (features['focus']) {
      features['focus'].NotePageSections = val && section ? [section] : [];
    }
    if (qc) {
      qc.setQueriesData(['extension'], (old: any) => {
        const arr = Array.isArray(old)
          ? old.filter((x: string) => !x.startsWith('__f_'))
          : ['focus'];
        return [...arr, '__f_' + Date.now()];
      });
    }
  }
};
