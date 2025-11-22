import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import React, { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

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
        <TouchableOpacity onPress={_login} disabled={!!auth.isLoading}>
          <View style={[Styles.button, auth.isLoading && { opacity: 0.6 }]}>
            {auth.isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={Styles.button_label}>{lang('Sign in')}</Text>
            )}
          </View>
        </TouchableOpacity>
        {auth.guestType === 'account' && (
          <TouchableOpacity
            onPress={() => dispatch({ type: 'LOGIN_GUEST' })}
            disabled={!!auth.isLoading}
          >
            <Text style={Styles.guest_footer_text}>{lang('Sign in as guest')}</Text>
          </TouchableOpacity>
        )}
        {auth.guestType === 'local' && (
          <TouchableOpacity
            onPress={() => dispatch({ type: 'LOGIN_LOCAL' })}
            disabled={!!auth.isLoading}
          >
            <Text style={Styles.guest_footer_text}>{lang('Sign in as local account')}</Text>
          </TouchableOpacity>
        )}
        <View style={Styles.login_social}>
          <View style={Styles.login_social_separator}>
            <View style={Styles.login_social_separator_line} />
            <Text style={Styles.login_social_separator_text}>{lang('OR')}</Text>
            <View style={Styles.login_social_separator_line} />
          </View>
          <View style={Styles.login_social_buttons}>
            {/* <TouchableOpacity onPress={() => {}} style={Styles.login_social_button}>
              <Image
                style={{ width: 25, height: 25, marginVertical: 15, resizeMode: 'stretch' }}
                source={{ uri: 'https://react-oauth.vercel.app/images/google-logo.png' }}
              />
              <Text style={Styles.guest_footer_text}>{lang('Sign in as Google account')}</Text>
            </TouchableOpacity> */}
            <View style={{ height: 15 }}></View>
            <GoogleOAuthProvider clientId="252515856483-7ko6lgc5sk3ccq46h8adovbejqsgbi65.apps.googleusercontent.com">
              <GoogleLogin
                onSuccess={(credentialResponse) => {
                  dispatch({ type: 'OAUTH_REQUEST', oauth: credentialResponse.credential });
                }}
              />
            </GoogleOAuthProvider>
          </View>
        </View>
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

const MAX_WIDTH = 320;

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
    maxWidth: MAX_WIDTH,
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
    maxWidth: MAX_WIDTH,
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
    flexDirection: 'row',
    alignSelf: 'center',
    color: '#808080',
    fontSize: 15,
  },
  login_social_buttons: {
    alignItems: 'center',
  },
  login_social_button: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
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
    marginVertical: 15,
  },
  login_footer_link: {
    color: '#208AEC',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
