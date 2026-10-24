import React, { Suspense, lazy } from 'react';

import LoadingView from '../../components/LoadingView';
import type { SearchSectionProps } from '../../hooks/useExtension';

const Section = lazy(() =>
  import('./SearchPageSection').then((module) => ({ default: module.SearchPageSection }))
);

export function SearchPageSection(props: SearchSectionProps) {
  return (
    <Suspense fallback={<LoadingView />}>
      <Section {...props} />
    </Suspense>
  );
}
