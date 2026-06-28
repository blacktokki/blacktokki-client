import { View, ActivityIndicator } from 'react-native';

import { useNotebookTheme } from '../hooks/useNotebookTheme';

export default () => {
  const { commonStyles } = useNotebookTheme();
  return (
    <View style={[commonStyles.card, commonStyles.centerContent]}>
      <ActivityIndicator size="large" color="#3498DB" />
    </View>
  );
};
