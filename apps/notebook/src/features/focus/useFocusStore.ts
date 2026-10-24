import { useCallback } from 'react';
import { QueryClient, useQueryClient } from 'react-query';

import FocusPageSection from './FocusPageSection';
import { getIsFocus, setFocusModeState, setGlobalQueryClient } from './focusState';

export { getIsFocus, setGlobalQueryClient } from './focusState';

export const setFocusMode = (val: boolean, queryClient?: QueryClient) => {
  setFocusModeState(val, queryClient, FocusPageSection);
};

export const useFocusMode = () => {
  const queryClient = useQueryClient();
  setGlobalQueryClient(queryClient);

  const handleSetFocusMode = useCallback(
    (val: boolean) => {
      setFocusMode(val, queryClient);
    },
    [queryClient]
  );

  return {
    isFocus: getIsFocus(),
    setFocusMode: handleSetFocusMode,
  };
};
