import { StackScreenProps } from '@react-navigation/stack';
import { StyleSheet, View } from 'react-native';
import { Editor } from '@blacktokki/editor';

import React from 'react';

export default function EditorScreen({ navigation, route }: StackScreenProps<any, 'Login'>) {
  return <View style={{ flex: 1, height: '100%' }}>
    <Editor theme={'light'} value={''} setValue={() => { } } active={true} />
  </View>
}
