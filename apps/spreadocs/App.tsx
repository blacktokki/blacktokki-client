// import { SortableTree } from '@blacktokki/core';
import { Editor } from '@blacktokki/editor';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, SafeAreaView } from 'react-native';

import SortableTree from './src/component/SortableTree';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <SafeAreaView style={[styles.container, { width: '100%', flexDirection: 'row' }]}>
        <View style={{ flex: 1, height: '100%' }}>
          <SortableTree />
        </View>
        <View style={{ flex: 512 / 81, height: '100%' }}>
          <Editor theme={'light'} value={''} setValue={() => {}} active={true} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
