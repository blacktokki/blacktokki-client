import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';

import useAuthContext from '../hooks/useAuthContext';

export default function Login({ lang }: { lang: (text: string) => string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { error, dispatch, auth } = useAuthContext();
  const _login = () => dispatch({ type: 'LOGIN_REQUEST', username, password });

  return (
    <View style={Styles.login_wrapper}>
      <View style={Styles.form}>
        {error && (
          <View style={Styles.form_error}>
            <Text style={Styles.form_error_text}>{lang(error)}</Text>
          </View>
        )}
        <TextInput
          style={Styles.form_input}
          value={username}
          placeholder={lang('Username')}
          onChangeText={(text) => setUsername(text)}
          autoCapitalize={'none'}
          keyboardType={'email-address'}
          onSubmitEditing={_login}
        />
        <TextInput
          style={Styles.form_input}
          value={password}
          placeholder={lang('Password')}
          secureTextEntry
          onChangeText={(text) => setPassword(text)}
          onSubmitEditing={_login}
        />
        <TouchableOpacity onPress={_login}>
          <View style={Styles.button}>
            <Text style={Styles.button_label}>{lang('Sign in')}</Text>
          </View>
        </TouchableOpacity>
        {auth.guestType === 'account' && (
          <TouchableOpacity onPress={() => dispatch({ type: 'LOGIN_GUEST' })}>
            <Text style={Styles.guest_footer_text}>{lang('Sign in as guest')}</Text>
          </TouchableOpacity>
        )}
        {auth.guestType === 'local' && (
          <TouchableOpacity onPress={() => dispatch({ type: 'LOGIN_LOCAL' })}>
            <Text style={Styles.guest_footer_text}>{lang('Sign in as local account')}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={Styles.login_social}>
        <View style={Styles.login_social_separator}>
          <View style={Styles.login_social_separator_line} />
          <Text style={Styles.login_social_separator_text}>{'*'}</Text>
          <View style={Styles.login_social_separator_line} />
        </View>
        <View style={Styles.login_social_buttons}></View>
      </View>
      {/* <>
        <TouchableOpacity onPress={() => navigate("RegistrationScreen")}>
          <Text style={Styles.login_footer_text}>
            {"Don't have an account? "}
            <Text style={Styles.login_footer_link}>{'Sign up'}</Text>
          </Text>
        </TouchableOpacity>
      </> */}
    </View>
  );
}

const Styles = StyleSheet.create({
  login_container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  login_header: {
    alignItems: 'center',
    paddingTop: 30,
    paddingBottom: 50,
    backgroundColor: '#208AEC',
  },
  login_header_logo: {
    width: 220,
    resizeMode: 'contain',
  },
  login_header_text: {
    marginTop: 15,
    color: '#f0f0f0',
    fontSize: 16,
  },
  login_header_text_bold: {
    color: '#fff',
    fontWeight: 'bold',
  },
  login_wrapper: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 40,
    borderTopRightRadius: 12,
    borderTopLeftRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 320,
  },
  form_error: {
    height: 22,
    width: '100%',
  },
  form_error_text: {
    textAlignVertical: 'center',
    color: 'red',
    fontSize: 13,
  },
  form_input: {
    height: 44,
    paddingHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#EDF0F7',
    borderRadius: 50,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    backgroundColor: '#0065A4',
    borderRadius: 50,
  },
  button_label: {
    color: '#fff',
    fontSize: 16,
  },
  login_social: {
    width: '100%',
    maxWidth: 280,
    marginTop: 20,
  },
  login_social_separator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  login_social_separator_line: {
    flex: 1,
    width: '100%',
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  login_social_separator_text: {
    marginHorizontal: 10,
    color: '#808080',
    fontSize: 16,
  },
  login_social_buttons: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  login_social_button: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E7E7E7',
    borderRadius: 60,
  },
  login_social_icon: {
    width: 38,
    height: 38,
    resizeMode: 'contain',
  },
  login_social_facebook: {
    backgroundColor: '#4267B2',
    borderColor: '#4267B2',
  },
  login_footer_text: {
    flexDirection: 'row',
    alignItems: 'center',
    color: '#808080',
    fontSize: 14,
  },
  guest_footer_text: {
    flexDirection: 'row',
    alignSelf: 'center',
    color: '#808080',
    fontSize: 15,
    margin: 15,
  },
  login_footer_link: {
    color: '#208AEC',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
