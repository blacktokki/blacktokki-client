import { useColorScheme } from '@blacktokki/core';
import React, { useState } from 'react';
import { View } from 'react-native';

import Tinymce from '../lib/TinymceWeb';

export default React.memo(
  (props: { content: string; onReady?: () => void; onPress?: () => void }) => {
    const theme = useColorScheme();
    const [ready, setReady] = useState<boolean>(false);
    return (
      <View style={{ flex: 1, height: '100%' }}>
        <Tinymce
          readonly
          theme={theme}
          value={`<div class="mceNonEditable"">${props.content}</div>`}
          setValue={() => {}}
          onPress={props.onPress}
          onReady={() => {
            if (!ready) {
              setReady(true);
              props.onReady?.();
            }
          }}
        />
      </View>
    );
  }
);
