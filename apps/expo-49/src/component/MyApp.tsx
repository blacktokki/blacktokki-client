import React from 'react';
import { SafeAreaView, StyleSheet, Text } from 'react-native';
import { SortableTree } from '@blacktokki/core';

const App = () => {
  return (
    <SafeAreaView style={styles.container}>
      <SortableTree/>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width:'100%',
    backgroundColor: 'white'
  }
});

export default App;