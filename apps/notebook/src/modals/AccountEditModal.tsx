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
import {
  View,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { usePat, usePatMutation } from '../hooks/usePat';
import { createCommonStyles } from '../styles';

// Modal is rendered by ModalsProvider. This component accepts an empty props object when opened via setModal(..., {}).
export default function AccountEditModal(_: object = {}) {
  const { lang } = useLangContext();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
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
  const { data: pats = [] } = usePat();
  const { createPat, deletePat } = usePatMutation();
  const [showPat, setShowPat] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

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

          <View style={{ marginTop: 10 }}>
            <TouchableOpacity
              style={[styles.patToggle, { borderTopColor: theme === 'dark' ? '#333' : '#eee' }]}
              onPress={() => setShowPat(!showPat)}
            >
              <Text style={[styles.label, { color: colors.text, flex: 1 }]}>
                {lang('Personal Access Token')}
              </Text>
              <Icon name={showPat ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text} />
            </TouchableOpacity>

            {showPat && (
              <View style={{ paddingLeft: 10, marginBottom: 10 }}>
                <View style={styles.patHeader}>
                  <Text style={[commonStyles.smallText, { flex: 1 }]}>
                    {lang('Manage your access tokens')}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      createPat.mutate(undefined, { onSuccess: (t) => setNewToken(t) })
                    }
                  >
                    <Text style={styles.generateText}>{lang('Generate New Token')}</Text>
                  </TouchableOpacity>
                </View>

                {/* 새 토큰 박스: 다크 모드 가독성 대응 */}
                {newToken && (
                  <View
                    style={[
                      styles.newTokenBox,
                      {
                        backgroundColor: theme === 'dark' ? '#2c2500' : '#fffbe6',
                        borderColor: theme === 'dark' ? '#594a00' : '#ffe58f',
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12, color: theme === 'dark' ? '#ffd666' : '#856404' }}>
                      {lang("Copy your new token now. It won't be shown again.")}
                    </Text>
                    <Text
                      selectable
                      style={{
                        fontWeight: 'bold',
                        marginVertical: 8,
                        color: theme === 'dark' ? '#fff' : '#000',
                      }}
                    >
                      {newToken}
                    </Text>
                  </View>
                )}

                {/* 토큰 목록: 테마별 구분선 적용 */}
                {pats.map((pat) => (
                  <View
                    key={pat.id}
                    style={[
                      styles.patRow,
                      { borderBottomColor: theme === 'dark' ? '#333' : '#eee' },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[commonStyles.text, { fontSize: 14 }]}>
                        {pat.description || lang('No Description')}
                      </Text>
                      <Text style={commonStyles.smallText}>
                        {lang('Expires')}: {pat.expired}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => deletePat.mutate(pat.id)}>
                      <Icon name="trash" size={16} color="#d9534f" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

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
  patToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  patHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  patRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
});
