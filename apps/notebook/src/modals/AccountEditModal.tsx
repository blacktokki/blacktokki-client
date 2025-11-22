import { useUserMutation, useAuthContext } from '@blacktokki/account';
import {
  CommonButton,
  Colors,
  useColorScheme,
  useLangContext,
  Text,
  useModalsContext,
} from '@blacktokki/core';
import React, { useEffect, useState } from 'react';
import { View, TextInput, StyleSheet, Alert, ActivityIndicator } from 'react-native';

// Modal is rendered by ModalsProvider. This component accepts an empty props object when opened via setModal(..., {}).
export default function AccountEditModal(_: object = {}) {
  const { lang } = useLangContext();
  const theme = useColorScheme();
  const colors = Colors[theme];
  const mutation = useUserMutation();
  const { setModal } = useModalsContext();
  const { auth } = useAuthContext();
  const user = auth.user;
  const overlayBg = theme === 'light' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';

  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const validateName = (v: string) => {
    const l = v.trim().length;
    return l >= 1 && l <= 64;
  };

  const passwordRegex = new RegExp('^(?=.*[A-Za-z])(?=.*\\d)[\\x21-\\x7E]{10,64}$');
  const validatePassword = (v: string) => {
    if (!v || v.length === 0) return true; // empty means no change
    return passwordRegex.test(v);
  };

  useEffect(() => {
    // initialize when modal becomes visible (ModalsProvider toggles visibility externally)
    setName(user?.name || '');
    setUsername(user?.username || '');
    setPassword('');
    setNameError(null);
    setPasswordError(null);
  }, [user]);

  const close = () => {
    setModal(AccountEditModal as any, null);
  };

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
        username: username || undefined,
        password: password || undefined,
      });
      Alert.alert(lang('Saved'));
      close();
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
            <Text style={[styles.label, { color: colors.text }]}>{lang('Name')}</Text>
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
            <Text style={[styles.label, { color: colors.text }]}>{lang('Username')}</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
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

          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text }]}>{lang('Password')}</Text>
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
              title={lang('cancel')}
              onPress={close}
              style={[
                styles.actionButton,
                { backgroundColor: 'transparent', borderColor: Colors[theme].buttonBorderColor },
              ]}
              textStyle={{ color: colors.text }}
            />
            <CommonButton
              title={lang('save')}
              onPress={onSave}
              disabled={loading || !!nameError || !!passwordError}
              style={[styles.actionButton, { marginLeft: 12 }]}
              color={Colors[theme].buttonBackgroundColor}
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
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 16,
  },
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
  input: {
    borderWidth: 1,
    padding: 8,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  label: {
    width: 96,
    fontSize: 14,
    paddingRight: 12,
    fontWeight: '600',
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
});
