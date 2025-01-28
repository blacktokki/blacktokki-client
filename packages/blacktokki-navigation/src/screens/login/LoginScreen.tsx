import { Login } from '@blacktokki/account';
import { useLangContext } from '@blacktokki/core';
import { StackScreenProps } from '@react-navigation/stack';
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';

export default function LoginScreen({ navigation, route }: StackScreenProps<any, 'Login'>) {
  const { lang } = useLangContext();
  useEffect(() => {
    navigation.setOptions({
      headerRight: undefined,
    });
  }, [navigation]);

  return (
    <View style={Styles.login_container}>
      <Login lang={lang} />
      {/* <ContractFooter theme="light" /> */}
    </View>
  );
}

const Styles = StyleSheet.create({
  login_container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
});
