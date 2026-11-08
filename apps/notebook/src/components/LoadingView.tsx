import { View, ActivityIndicator, StyleProp, ViewStyle } from 'react-native';

import { useNotebookTheme } from '../hooks/useNotebookTheme';

export default ({ style }: { style?: StyleProp<ViewStyle> }) => {
  const { commonStyles } = useNotebookTheme();
  return (
    <View style={[commonStyles.card, commonStyles.centerContent, style]}>
      <ActivityIndicator size="large" color="#3498DB" />
    </View>
  );
};
