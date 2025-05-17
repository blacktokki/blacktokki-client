import React, { Suspense, useEffect, useState } from 'react';
import { View } from 'react-native';

import { EditorProps } from '../types';

const emptyFunction = () => {};

export default (
  props: EditorProps & { active: boolean; onPress?: () => void; onLink?: (url: string) => void }
) => {
  const [ready, setReady] = useState<boolean>(false);
  const Tinymce = React.lazy(() => import('../lib/TinymceWeb'));
  useEffect(() => {
    if (!props.active) setReady(false);
  }, [props.active]);
  return (
    <View style={props.active ? { flex: 1 } : { flex: 0 }}>
      <View style={{ flex: 1, height: '100%' }}>
        <Suspense>
          <Tinymce
            readonly
            theme={props.theme}
            value={props.value}
            setValue={emptyFunction}
            autoResize={props?.autoResize}
            onPress={props.onPress || emptyFunction}
            onLink={props.onLink}
            onReady={() => {
              if (!ready) {
                setReady(true);
              }
            }}
          />
        </Suspense>
      </View>
    </View>
  );
};
