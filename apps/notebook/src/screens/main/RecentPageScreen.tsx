import { useResizeContext } from '@blacktokki/core';
import React from 'react';

import { SearchBar } from '../../components/SearchBar';
import { RecentPagesSection } from './RecentPageSection';

export const RecentPagesScreen: React.FC = () => {
  const window = useResizeContext();
  return (
    <>
      {window === 'portrait' && <SearchBar />}
      <RecentPagesSection />
    </>
  );
};
