import React, { useState, useEffect, Suspense } from 'react';
import { View } from 'react-native';

import { AutoCompleteProps, EditorProps } from '../types';

export default (
  props: EditorProps & AutoCompleteProps & { active: boolean; setValue: (v: string) => void }
) => {
  const [ready, setReady] = useState<boolean>(false);
  const Tinymce = React.lazy(() => import('../lib/TinymceWeb'));
  useEffect(() => {
    if (!props.active) setReady(false);
  }, [props.active]);
  return (
    <View style={props.active ? { flex: 1, height: '100%' } : { display: 'none' }}>
      <Suspense>
        <Tinymce
          theme={props.theme}
          value={props.value}
          setValue={props.setValue}
          autoResize={props?.autoResize}
          autoComplete={props?.autoComplete}
          onReady={() => {
            if (!ready) {
              setReady(true);
            }
          }}
        />
      </Suspense>
    </View>
  );
};
