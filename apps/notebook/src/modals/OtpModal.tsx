import { useAuthContext } from '@blacktokki/account';
import {
  CommonButton,
  Text,
  useLangContext,
  useModalsContext,
  View,
  Colors,
  useColorScheme,
} from '@blacktokki/core';
import React, { useEffect, useState } from 'react';
import { TextInput, StyleSheet } from 'react-native';

export default function OtpModal({ onSuccess }: { onSuccess: (token: string) => void }) {
  const { lang } = useLangContext();
  const { setModal } = useModalsContext();
  const { otp } = useAuthContext();
  const theme = useColorScheme();
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState(false);

  const handleVerify = async () => {
    if (otpCode.length !== 6) return;

    const isValid = await otp?.verify(parseInt(otpCode, 10));
    if (isValid) {
      onSuccess(isValid);
      setModal(OtpModal, null);
    } else {
      setError(true);
      setOtpCode('');
    }
  };

  useEffect(() => {
    if (otpCode.length === 6) {
      handleVerify();
    }
  }, [otpCode]);

  return (
    <View style={styles.overlay}>
      <View style={[styles.container, { backgroundColor: Colors[theme].background }]}>
        <Text style={styles.title}>{lang('Enter OTP')}</Text>
        <TextInput
          style={[
            styles.input,
            { color: Colors[theme].text, borderColor: Colors[theme].buttonBorderColor },
          ]}
          placeholder="000000"
          placeholderTextColor="#888"
          keyboardType="number-pad"
          maxLength={6}
          value={otpCode}
          onSubmitEditing={handleVerify}
          onChangeText={setOtpCode}
          autoFocus
        />
        {error && <Text style={styles.error}>{lang('The code does not match.')}</Text>}
        <View style={styles.buttonRow}>
          <CommonButton
            title={lang('cancel')}
            onPress={() => setModal(OtpModal, null)}
            style={styles.cancelButton}
          />
          <CommonButton title={lang('Verify')} onPress={handleVerify} style={styles.verifyButton} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  container: { padding: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16, elevation: 5 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 20,
  },
  error: {
    color: 'red',
    marginBottom: 6,
    fontSize: 12,
  },
  buttonRow: { flexDirection: 'row', justifyContent: 'center' },
  verifyButton: { marginRight: 10, minWidth: 100 },
  cancelButton: { backgroundColor: '#888', minWidth: 100 },
});
