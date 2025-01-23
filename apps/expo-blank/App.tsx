import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, SafeAreaView } from 'react-native';
import Component from './src/component/Component';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
        <SafeAreaView style={styles.container}>
          <Component/>
        </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#4444",
    alignItems: 'center',
    justifyContent: 'center',
  },
});
