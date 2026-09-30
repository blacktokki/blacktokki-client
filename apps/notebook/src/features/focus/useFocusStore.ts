import { useCallback } from 'react';
import { QueryClient, useQueryClient } from 'react-query';

import FocusPageSection from './FocusPageSection';
import { features } from '../../hooks/useExtension';

let globalQueryClient: QueryClient | null = null;
let isFocus = false;

export const setGlobalQueryClient = (qc: QueryClient) => {
  globalQueryClient = qc;
};

export const getIsFocus = () => isFocus;

export const setFocusMode = (val: boolean, queryClient?: QueryClient) => {
  const qc = queryClient || globalQueryClient;
  if (isFocus !== val) {
    isFocus = val;
    if (features['focus']) {
      features['focus'].NotePageSections = val ? [FocusPageSection] : [];
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

export const useFocusMode = () => {
  const queryClient = useQueryClient();
  globalQueryClient = queryClient;

  const handleSetFocusMode = useCallback(
    (val: boolean) => {
      setFocusMode(val, queryClient);
    },
    [queryClient]
  );

  return {
    isFocus,
    setFocusMode: handleSetFocusMode,
  };
};
