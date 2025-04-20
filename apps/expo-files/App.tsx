import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, SafeAreaView } from 'react-native';
import FileSystem from './src/component/FileSystem';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
        <SafeAreaView style={styles.container}>
          <FileSystem/>
        </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width:'100%',
    borderWidth: 1,
    borderColor: "#4444",
    alignItems: 'center',
    justifyContent: 'center',
  },
});
