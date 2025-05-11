import React from 'react';
import { RecentPagesSection } from './RecentPageSection';
import { SearchBar } from '../../components/SearchBar';
import { useResizeContext } from '@blacktokki/core';

export const RecentPagesScreen: React.FC = () => {
  const window  = useResizeContext()
  return <>
    {window === 'portrait' && <SearchBar/>}
    <RecentPagesSection/>
  </>
};
