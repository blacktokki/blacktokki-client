import React from 'react';

const Component = () => {
  const Text = React.lazy(() =>
    import('@blacktokki/core').then(({ Text }) => {
      return {
        default: Text,
      };
    })
  );
  return <React.Suspense><Text style={{backgroundColor:'gray'}}>hi</Text></React.Suspense>;
};

export default Component;