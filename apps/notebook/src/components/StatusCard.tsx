import { useLangContext } from '@blacktokki/core';
import React from 'react';
import { View, Text, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';

import { useNotebookTheme } from '../hooks/useNotebookTheme';

type StatusCardProps = {
  message: string;
  buttonTitle?: string;
  onButtonPress?: () => void;
  buttons?: { title: string; onPress: () => void }[];
  style?: StyleProp<ViewStyle>;
};

const StatusCard: React.FC<StatusCardProps> = ({
  message,
  buttonTitle,
  onButtonPress,
  buttons,
  style,
}) => {
  const { commonStyles } = useNotebookTheme();
  const { lang } = useLangContext();

  const buttonList =
    buttons ||
    (buttonTitle && onButtonPress ? [{ title: buttonTitle, onPress: onButtonPress }] : []);

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
      {buttonList.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
          {buttonList.map((btn, index) => (
            <TouchableOpacity key={index} onPress={btn.onPress} style={commonStyles.button}>
              <Text style={commonStyles.buttonText}>{lang(btn.title)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

export default StatusCard;
