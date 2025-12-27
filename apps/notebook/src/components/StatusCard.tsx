import { useColorScheme, useLangContext } from '@blacktokki/core';
import React from 'react';
import { View, Text, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';

import { createCommonStyles } from '../styles';

type StatusCardProps = {
  message: string;
  buttonTitle?: string;
  onButtonPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const StatusCard: React.FC<StatusCardProps> = ({ message, buttonTitle, onButtonPress, style }) => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();

  return (
    <View
      style={[
        commonStyles.card,
        commonStyles.centerContent,
        { justifyContent: 'center', alignItems: 'center', marginTop: 20 },
        style,
      ]}
    >
      <Text selectable={false} style={commonStyles.text}>
        {lang(message)}
      </Text>
      {buttonTitle && onButtonPress && (
        <TouchableOpacity onPress={onButtonPress} style={commonStyles.button}>
          <Text style={commonStyles.buttonText}>{lang(buttonTitle)}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default StatusCard;
