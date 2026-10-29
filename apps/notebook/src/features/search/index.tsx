import React from 'react';

const LazySearchPageScreen = React.lazy(() =>
  import('./SearchPageScreen').then(({ SearchPageScreen }) => ({
    default: SearchPageScreen,
  }))
);

export const SearchPageScreen = () => (
  <React.Suspense fallback={null}>
    <LazySearchPageScreen />
  </React.Suspense>
);
