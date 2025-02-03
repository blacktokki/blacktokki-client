import React from 'react';
import { StyleSheet } from 'react-native';

import CommonButton, { CustomButtonProps } from './CommonButton';

export default (props: CustomButtonProps) => {
  return <CommonButton {...props} style={[styles.style, props.style]} />;
};

const styles = StyleSheet.create({
  style: {
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
});
