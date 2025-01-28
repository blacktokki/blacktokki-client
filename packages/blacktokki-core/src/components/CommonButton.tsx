import React, { useState } from 'react';
import {
  Text,
  StyleSheet,
  Pressable,
  StyleProp,
  ViewStyle,
  ButtonProps,
  TextStyle,
} from 'react-native';

import Colors from '../constants/Colors';
import useColorScheme from '../hooks/useColorScheme';

export type CustomButtonProps = ButtonProps & {
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  onPress: () => void;
  children?: React.ReactNode;
};

const DefaultButton = (props: CustomButtonProps & { borderColor: string }) => {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={() => props.onPress()}
      //@ts-ignore
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      disabled={props.disabled}
      style={[
        {
          paddingVertical: 5,
          paddingHorizontal: 16,
        },
        props.style,
        hover || props.disabled
          ? { backgroundColor: props.color, borderColor: props.borderColor }
          : {},
      ]}
    >
      {props.children ? (
        props.children
      ) : (
        <Text selectable={false} style={[{ fontSize: 14 }, props.textStyle]}>
          {props.title}
        </Text>
      )}
    </Pressable>
  );
};

export default (props: CustomButtonProps) => {
  const theme = useColorScheme();
  const _props = {
    color: Colors[theme].hoverColor,
    borderColor: theme === 'light' ? Colors[theme].buttonBorderColor : '#7d8590',
    ...props,
    style: [
      styles.style,
      {
        backgroundColor: Colors[theme].buttonBackgroundColor,
        borderColor: Colors[theme].buttonBorderColor,
      },
      props.style,
    ] as StyleProp<ViewStyle>,
    textStyle: [styles.text, { color: Colors[theme].text }, props.textStyle],
  };
  return <DefaultButton {..._props} />;
};

const styles = StyleSheet.create({
  style: {
    borderRadius: 6,
    borderWidth: 1,
  },
  text: {
    textAlign: 'center',
    fontWeight: '600',
  },
});
