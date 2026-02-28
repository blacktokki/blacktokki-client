import { useUserMutation, useAuthContext, OtpResponse } from '@blacktokki/account';
import { CommonButton, Colors, useColorScheme, useLangContext, Text } from '@blacktokki/core';
import React, { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const OtpSection = React.memo(
  ({
    setLoading,
    renderToggle,
    openOtp,
  }: {
    setLoading: (loading: boolean) => void;
    renderToggle: (active: boolean, color: string) => React.JSX.Element;
    openOtp?: boolean;
  }) => {
    const { lang } = useLangContext();
    const theme = useColorScheme();
    const colors = Colors[theme];
    const { auth, dispatch, otp } = useAuthContext();
    const user = auth.user;
    const commonStyles = {
      smallText: { color: colors.text, fontSize: 14 },
      text: { color: colors.text, fontSize: 16 },
    };
    const sectionStyles = accountEditStyles.colors[theme];

    const [showOtp, setShowOtp] = useState(openOtp);
    const [otpData, setOtpData] = useState<OtpResponse>();
    const [otpCode, setOtpCode] = useState('');
    const [otpVerify, setOtpVerify] = useState<boolean | null>();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const handleCreateOtp = async () => {
      if (!otp) {
        return;
      }
      setLoading(true);
      const result = await otp.create();
      setOtpData(result);
      setLoading(false);
    };

    const handleVerify = async () => {
      if (!user || otpVerify === null || !otpData || otpCode.length !== 6) return;
      dispatch({
        type: 'OTP_REQUEST',
        otpSecretKey: otpData.secretKey,
        otpCode: parseInt(otpCode, 10),
      });
      setOtpVerify(null);
    };

    useEffect(() => {
      if (openOtp && !auth.hasOtp) {
        handleCreateOtp();
      }
    }, [openOtp]);

    useEffect(() => {
      if (otpVerify === null && auth.hasOtp !== null) {
        setOtpVerify(auth.hasOtp === true);
      }
    }, [auth, otpVerify]);

    return (
      <View style={{ marginTop: 10 }}>
        <TouchableOpacity
          style={[accountEditStyles.styles.toggle, { borderTopColor: colors.buttonBorderColor }]}
          onPress={() => setShowOtp(!showOtp)}
        >
          <Text style={[accountEditStyles.styles.label, { color: colors.text, flex: 1 }]}>
            {lang('OTP (2-Factor Auth)')}
          </Text>
          {renderToggle(showOtp || false, colors.text)}
        </TouchableOpacity>
        {showOtp && (
          <View style={{ paddingLeft: 10, marginBottom: 10 }}>
            {!auth.hasOtp && !otpData && (
              <TouchableOpacity onPress={handleCreateOtp}>
                <Text style={styles.generateText}>{lang('Generate New Token')}</Text>
              </TouchableOpacity>
            )}

            {!auth.hasOtp && otpData?.secretKey && (
              <View
                style={[
                  styles.newTokenBox,
                  {
                    backgroundColor: sectionStyles.newTokenBg,
                    borderColor: sectionStyles.newTokenBorder,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: sectionStyles.newTokenText,
                    marginBottom: 10,
                  }}
                >
                  {lang(
                    'Register the key below in your authenticator app and enter the 6-digit code.'
                  )}
                </Text>

                <View style={styles.qrContainer}>
                  <QRCode
                    value={otpData.otpAuthUrl}
                    size={150}
                    backgroundColor="transparent"
                    color={commonStyles.text.color}
                  />
                  <Text style={[commonStyles.smallText, { marginTop: 8 }]}>
                    {lang('Scan QR Code')}
                  </Text>
                </View>

                <Text style={[commonStyles.smallText, { marginTop: 12 }]}>
                  {lang('OTP Secret Key')}
                </Text>
                <View style={styles.secretKeyBox}>
                  <Text selectable style={[commonStyles.text, { fontWeight: 'bold' }]}>
                    {otpData.secretKey}
                  </Text>
                </View>

                <View style={styles.verifySection}>
                  <TextInput
                    style={[
                      styles.inputInline,
                      {
                        color: colors.text,
                        borderColor: colors.buttonBorderColor,
                      },
                    ]}
                    placeholder="000000"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otpCode}
                    onChangeText={setOtpCode}
                  />
                  <CommonButton
                    title={lang('save')}
                    onPress={handleVerify}
                    style={{ marginLeft: 8, height: 40, justifyContent: 'center' }}
                  />
                </View>
                {otpVerify === false && (
                  <Text style={styles.error}>{lang('The code does not match.')}</Text>
                )}
              </View>
            )}

            {auth.hasOtp && (
              <View style={{ marginTop: 8 }}>
                {!isConfirmingDelete ? (
                  <View style={styles.otpActiveRow}>
                    <Text style={{ color: '#27ae60', fontWeight: 'bold' }}>● {lang('In Use')}</Text>
                    <TouchableOpacity onPress={() => setIsConfirmingDelete(true)}>
                      <Text style={{ color: '#d9534f', marginLeft: 16 }}>{lang('Delete')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.newTokenBox,
                      {
                        borderColor: '#d9534f',
                        backgroundColor: sectionStyles.deleteBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        commonStyles.smallText,
                        { fontSize: 14, color: '#d9534f', marginBottom: 10 },
                      ]}
                    >
                      {lang('Disabling OTP will log you out for security. Continue?')}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => setIsConfirmingDelete(false)}
                        style={{ padding: 8, marginRight: 8 }}
                      >
                        <Text style={[commonStyles.text, { fontSize: 14 }]}>{lang('cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => dispatch({ type: 'LOGOUT_REQUEST', resetOtp: true })}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                          backgroundColor: '#d9534f',
                          borderRadius: 4,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                          {lang('Sign out') + ' & ' + lang('Reset OTP')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    );
  }
);

export const accountEditStyles = {
  colors: {
    dark: {
      newTokenBg: '#2c2500',
      newTokenBorder: '#594a00',
      newTokenText: '#ffd666',
      deleteBg: '#2c1515',
    },
    light: {
      newTokenBg: '#fffbe6',
      newTokenBorder: '#ffe58f',
      newTokenText: '#856404',
      deleteBg: '#fff5f5',
    },
  },
  styles: StyleSheet.create({
    toggle: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderTopWidth: 1,
    },
    label: {
      width: 96,
      fontSize: 14,
      paddingRight: 12,
      fontWeight: '600',
    },
  }),
};

export default function AccountEditSection({
  children,
  loading,
  openOtp,
  setLoading,
  renderToggle,
  onClose,
}: {
  children?: React.JSX.Element;
  loading: boolean;
  openOtp?: boolean;
  setLoading: (loading: boolean) => void;
  renderToggle: (active: boolean, color: string) => React.JSX.Element;
  onClose: () => void;
}) {
  const { lang } = useLangContext();
  const theme = useColorScheme();
  const colors = Colors[theme];
  const mutation = useUserMutation();
  const { auth } = useAuthContext();
  const user = auth.user;
  const overlayBg = theme === 'light' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';

  const [name, setName] = useState(user?.name || '');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const validateName = (v: string) => {
    const l = v.trim().length;
    return l >= 1 && l <= 64;
  };

  const passwordRegex = new RegExp('^(?=.*[A-Za-z])(?=.*\\d)[\\x21-\\x7E]{10,64}$');
  const validatePassword = (v: string) => {
    if (!v || v.length === 0) return true;
    return passwordRegex.test(v);
  };

  useEffect(() => {
    if (user) {
      setName(user?.name || '');
      setPassword('');
      setNameError(null);
      setPasswordError(null);
    } else {
      onClose();
    }
  }, [user]);

  const onSave = async () => {
    if (!user) return;
    const okName = validateName(name);
    const okPass = validatePassword(password);
    setNameError(okName ? null : lang('Name must be 1-64 characters'));
    setPasswordError(okPass ? null : lang('Password requirements'));
    if (!okName || !okPass) return;
    setLoading(true);
    try {
      await mutation.update({
        id: user.id,
        name,
        username: user.username,
        password: password || undefined,
      });
      Alert.alert(lang('Saved'));
      onClose();
    } catch (e) {
      Alert.alert(lang('Failed to save'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        margin: 0,
        justifyContent: 'flex-end',
        backgroundColor: 'transparent',
      }}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
          },
        ]}
      >
        <View style={[styles.card, { maxWidth: 680, alignSelf: 'center', width: '100%' }]}>
          <Text style={[styles.title, { color: colors.text }]}>{lang('My Account')}</Text>
          <View style={styles.row}>
            <Text style={[accountEditStyles.styles.label, { color: colors.text }]}>
              {lang('Username')}
            </Text>
            <Text
              style={[accountEditStyles.styles.label, { color: colors.text, flex: 1, padding: 12 }]}
            >
              {user?.username}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={[accountEditStyles.styles.label, { color: colors.text }]}>
              {lang('Name')}
            </Text>
            <TextInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                setNameError(validateName(v) ? null : lang('Name must be 1-64 characters'));
              }}
              style={[
                styles.inputInline,
                {
                  borderColor: Colors.borderColor,
                  backgroundColor: Colors[theme].buttonBackgroundColor,
                  color: colors.text,
                },
              ]}
            />
          </View>
          {nameError && <Text style={styles.error}>{nameError}</Text>}
          <View style={styles.row}>
            <Text style={[accountEditStyles.styles.label, { color: colors.text }]}>
              {lang('Password')}
            </Text>
            <TextInput
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setPasswordError(validatePassword(v) ? null : lang('Password requirements'));
              }}
              secureTextEntry
              style={[
                styles.inputInline,
                {
                  borderColor: Colors.borderColor,
                  backgroundColor: Colors[theme].buttonBackgroundColor,
                  color: colors.text,
                },
              ]}
            />
          </View>
          {passwordError && <Text style={styles.error}>{passwordError}</Text>}

          <View style={styles.actions}>
            <CommonButton
              title={lang('save')}
              onPress={onSave}
              disabled={loading || !!nameError || !!passwordError}
              style={[styles.actionButton, { marginLeft: 12 }]}
              color={Colors[theme].buttonBackgroundColor}
            />
          </View>
          <OtpSection setLoading={setLoading} renderToggle={renderToggle} openOtp={openOtp} />
          {children}
          <View style={styles.actions}>
            <CommonButton
              title={lang('close')}
              onPress={onClose}
              style={[
                styles.actionButton,
                { backgroundColor: 'transparent', borderColor: Colors[theme].buttonBorderColor },
              ]}
              textStyle={{ color: colors.text }}
            />
          </View>
          {loading && (
            <View
              style={[styles.loadingOverlay, { backgroundColor: overlayBg }]}
              pointerEvents="none"
            >
              <ActivityIndicator size="large" color="#3498DB" />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    padding: 12,
  },
  card: {
    padding: 20,
    borderRadius: 12,
    // Material-like shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  inputInline: {
    flex: 1,
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  actions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  actionButton: {
    minWidth: 88,
    paddingHorizontal: 12,
  },
  error: {
    color: 'red',
    marginBottom: 6,
    fontSize: 12,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 12,
    zIndex: 20,
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 4,
  },
  secretKeyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 4,
    marginTop: 4,
  },
  verifySection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
  },
  otpActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  generateText: {
    color: '#3498DB',
    fontWeight: 'bold',
    fontSize: 14,
  },
  newTokenBox: {
    backgroundColor: '#fffbe6',
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ffe58f',
    marginBottom: 10,
  },
});
