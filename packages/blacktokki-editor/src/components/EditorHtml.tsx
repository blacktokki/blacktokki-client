import { useColorScheme } from '@blacktokki/core';
import React, { useState } from 'react';
import { View } from 'react-native';

import Editor from '../lib/tinymce/Editor';

export default React.memo((props: { content: string; onReady?: () => void }) => {
  const theme = useColorScheme();
  const [ready, setReady] = useState<boolean>(false);
  return (
    <View style={{ flex: 1, height: '100%' }}>
      <Editor
        readonly
        theme={theme}
        value={`<div class="mceNonEditable"">${props.content}</div>`}
        setValue={() => {}}
        onReady={() => {
          if (!ready) {
            setReady(true);
            props.onReady?.();
          }
        }}
      />
    </View>
  );
});
