import { useColorScheme } from '@blacktokki/core';
import { View, ActivityIndicator } from 'react-native';

import { createCommonStyles } from '../styles';

export default () => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  return (
    <View style={[commonStyles.card, commonStyles.centerContent]}>
      <ActivityIndicator size="large" color="#3498DB" />
    </View>
  );
};
