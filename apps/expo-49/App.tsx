import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import MyApp from './src/component/MyApp';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <MyApp/>
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
