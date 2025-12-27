import React from 'react';

import { RecentPagesSection } from './RecentPageSection';
import { ResponsiveSearchBar } from '../../components/SearchBar';

export const RecentPagesScreen: React.FC = () => {
  return (
    <>
      <ResponsiveSearchBar />
      <RecentPagesSection />
    </>
  );
};
