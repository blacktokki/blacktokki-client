import React from 'react';
import { View, StyleSheet, Linking, Platform, TouchableOpacity } from 'react-native';

const openURL =
  Platform.OS === 'web'
    ? (url: string) => {
        location.href = url;
      }
    : Linking.openURL;

export default ({
  buttons,
}: {
  buttons: { icon: React.JSX.Element; url: string; isWeb?: boolean }[];
}) => {
  return (
    <View style={Styles.footer_buttons}>
      {buttons.map((button, i) => {
        return (
          <TouchableOpacity
            key={i}
            style={Styles.footer_button}
            onPress={() => (button.isWeb ? openURL(button.url) : Linking.openURL(button.url))}
          >
            {button.icon}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const Styles = StyleSheet.create({
  footer_buttons: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingBottom: 20,
    paddingRight: 20,
  },
  footer_button: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E7E7E7',
    borderRadius: 60,
  },
});
