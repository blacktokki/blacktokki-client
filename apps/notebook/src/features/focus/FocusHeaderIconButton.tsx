import React, { useEffect } from 'react';
import { useQueryClient } from 'react-query';

import { setFocusMode, setGlobalQueryClient } from './useFocusStore';
import { NoteSectionProps } from '../../hooks/useExtension';
import { HeaderIconButton } from '../../screens/main/NoteItemSections';

export default (props: NoteSectionProps) => {
  const queryClient = useQueryClient();
  setGlobalQueryClient(queryClient);

  useEffect(() => {
    setFocusMode(false, queryClient);
  }, [props.title, queryClient]);

  const handlePress = () => {
    setFocusMode(true, queryClient);
  };

  return <HeaderIconButton name="window-maximize" onPress={handlePress} />;
};
