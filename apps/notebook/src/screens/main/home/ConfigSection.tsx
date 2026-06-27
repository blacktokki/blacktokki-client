import { useAuthContext } from '@blacktokki/account';
import {
  Colors,
  TextButton,
  useColorScheme,
  useLangContext,
  Text,
  useModalsContext,
} from '@blacktokki/core';
import { ConfigSection, LanguageConfigSection, SkinConfigSection } from '@blacktokki/navigation';
import { useNavigation } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Alert } from 'react-native';
import MciIcon from 'react-native-vector-icons/MaterialCommunityIcons';

import { SearchList } from '../../../components/SearchBar';
import { useExtension } from '../../../hooks/useExtension';
import { useKeywords, useResetKeyowrd } from '../../../hooks/useKeywordStorage';
import {
  useNotebooks,
  useCurrentNotebook,
  useSetCurrentNotebookId,
  useCreateOrUpdateNotebook,
  useDeleteNotebook,
} from '../../../hooks/useNotebookStorage';
import {
  usePrivate,
  usePrivateOtp,
  useSetPrivate,
  useSetPrivateOtp,
} from '../../../hooks/usePrivate';
import { useSetUsageMode, useUsageMode } from '../../../hooks/useUsageMode';
import AccountEditModal from '../../../modals/AccountEditModal';
import { createCommonStyles } from '../../../styles';
import { NavigationParamList, NotebookOption } from '../../../types';

export const OptionButton = (props: { title: string; onPress: () => void; active: boolean }) => {
  const theme = useColorScheme();
  const color = Colors[theme].text;
  return (
    <TextButton
      title={props.title}
      textStyle={{
        fontSize: 16,
        color,
        textDecorationLine: props.active ? 'underline' : 'none',
      }}
      style={{ borderRadius: 20 }}
      onPress={props.onPress}
    />
  );
};

export default () => {
  const { lang } = useLangContext();
  const { auth, dispatch } = useAuthContext();
  const theme = useColorScheme();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const commonStyles = createCommonStyles(theme);
  const [noteConfig, setNoteConfig] = useState<'search' | 'usage'>();
  const { setModal } = useModalsContext();
  const { data: keywords = [] } = useKeywords();
  const resetKeyword = useResetKeyowrd();
  const { data: privateConfig } = usePrivate();
  const { data: privateOtp } = usePrivateOtp();
  const setPrivate = useSetPrivate();
  const setPrivateOtp = useSetPrivateOtp();
  const { data: usageMode } = useUsageMode();
  const setUsageMode = useSetUsageMode();
  const { data: extension } = useExtension();

  // 노트북 상태 및 훅 추가
  const { data: notebooks = [] } = useNotebooks();
  const { currentNotebookId } = useCurrentNotebook();
  const setNotebookId = useSetCurrentNotebookId();
  const createNotebook = useCreateOrUpdateNotebook();
  const deleteNotebook = useDeleteNotebook();

  const [isAddingNotebook, setIsAddingNotebook] = useState(false);
  const [editingNotebookId, setEditingNotebookId] = useState<number | undefined>();
  const [newNotebookTitle, setNewNotebookTitle] = useState('');
  const [newNotebookDescription, setNewNotebookDescription] = useState('');
  const [newNotebookType, setNewNotebookType] =
    useState<NotebookOption['NOTEBOOK_TYPE']>('WORKSPACE');

  // 모드별 설명

  // 프라이빗 모드 여부에 따른 노트북 필터링 (비활성화 시 프라이빗 노트북 숨김)
  const visibleNotebooks = privateConfig.enabled
    ? notebooks
    : notebooks.filter((nb) => !nb.option?.NOTEBOOK_TYPE?.includes('PRIVATE'));

  // 프라이빗 모드 여부에 따른 생성 가능 하위 모드 필터링
  const availableNotebookTypes: NotebookOption['NOTEBOOK_TYPE'][] = privateConfig.enabled
    ? ['PRIVATE_NOTE', 'WORKSPACE', 'PRIVATE_WORKSPACE']
    : ['WORKSPACE'];

  return (
    <View>
      <View style={commonStyles.card}>
        <ConfigSection
          title={lang('* Usage')}
          onPress={() => navigation.push('NoteViewer', { key: 'Usage' })}
        />
      </View>
      <View style={commonStyles.card}>
        <LanguageConfigSection />
      </View>
      <View style={commonStyles.card}>
        <SkinConfigSection />
      </View>
      <View style={commonStyles.card}>
        <ConfigSection title={lang('* Note Settings')}>
          <View style={{ flexDirection: 'row' }}>
            <OptionButton
              title={lang('Mode Settings')}
              onPress={() => setNoteConfig(noteConfig === 'usage' ? undefined : 'usage')}
              active={noteConfig === 'usage'}
            />
            <OptionButton
              title={lang('Search History')}
              onPress={() => setNoteConfig(noteConfig === 'search' ? undefined : 'search')}
              active={noteConfig === 'search'}
            />
            {!auth.isLocal && usageMode !== 'SIMPLE' && (
              <OptionButton
                title={lang('Changelog')}
                onPress={() => navigation.push('Archive', {})}
                active={false}
              />
            )}
          </View>
          {noteConfig === 'search' && (
            <>
              <View style={[commonStyles.card, { padding: 0, marginTop: 16 }]}>
                <SearchList filteredPages={keywords} />
              </View>
              <View style={{ flexDirection: 'row' }}>
                <OptionButton
                  title={lang('Clear')}
                  onPress={() => resetKeyword.mutate()}
                  active={false}
                />
              </View>
            </>
          )}

          {/* 통합된 사용 모드 및 노트북/프라이빗 관리 영역 */}
          {noteConfig === 'usage' && (
            <View style={{ marginTop: 12 }}>
              <Text style={[commonStyles.text, { fontWeight: 'bold', marginBottom: 12 }]}>
                {lang('Usage Mode')}
              </Text>
              <View
                style={{
                  padding: 12,
                  borderWidth: 1,
                  borderColor: commonStyles.card.borderColor,
                  borderRadius: 8,
                  marginBottom: 16,
                }}
              >
                {/* 간단 모드 */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'column',
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: commonStyles.card.borderColor,
                  }}
                  onPress={() => {
                    setUsageMode.mutate('SIMPLE');
                    setNotebookId.mutate(null);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MciIcon
                      name="file-document-outline"
                      size={18}
                      color={
                        usageMode === 'SIMPLE' ? '#3498DB' : (commonStyles.text.color as string)
                      }
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      style={[
                        commonStyles.text,
                        usageMode === 'SIMPLE' && {
                          color: '#3498DB',
                          fontWeight: 'bold',
                          textDecorationLine: 'underline',
                        },
                      ]}
                    >
                      {lang('Simple Mode')}
                    </Text>
                  </View>
                  <Text
                    style={[
                      commonStyles.smallText,
                      { marginTop: 4, marginLeft: 26, color: 'gray' },
                    ]}
                  >
                    {lang('A lightweight environment providing only essential features.')}
                  </Text>
                </TouchableOpacity>

                {/* 노트 모드 */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'column',
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: commonStyles.card.borderColor,
                  }}
                  onPress={() => {
                    setUsageMode.mutate('NOTE');
                    setNotebookId.mutate(null);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MciIcon
                      name="file-document-multiple-outline"
                      size={18}
                      color={usageMode === 'NOTE' ? '#3498DB' : (commonStyles.text.color as string)}
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      style={[
                        commonStyles.text,
                        usageMode === 'NOTE' && {
                          color: '#3498DB',
                          fontWeight: 'bold',
                          textDecorationLine: 'underline',
                        },
                      ]}
                    >
                      {lang('Note Mode')}
                    </Text>
                  </View>
                  <Text
                    style={[
                      commonStyles.smallText,
                      { marginTop: 4, marginLeft: 26, color: 'gray' },
                    ]}
                  >
                    {lang('Provides all knowledge management features except boards.')}
                  </Text>
                </TouchableOpacity>

                {visibleNotebooks.map((nb) => {
                  const isActive = usageMode === 'NOTEBOOK' && currentNotebookId === nb.id;
                  return (
                    <View
                      key={nb.id}
                      style={{
                        flexDirection: 'column',
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: commonStyles.card.borderColor,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                          onPress={() => {
                            setUsageMode.mutate('NOTEBOOK');
                            setNotebookId.mutate(nb.id);
                          }}
                        >
                          <MciIcon
                            name="notebook-outline"
                            size={18}
                            color={isActive ? '#3498DB' : (commonStyles.text.color as string)}
                            style={{ marginRight: 8 }}
                          />
                          <Text
                            style={[
                              commonStyles.text,
                              isActive && {
                                color: '#3498DB',
                                fontWeight: 'bold',
                                textDecorationLine: 'underline',
                              },
                            ]}
                          >
                            {nb.title}{' '}
                            <Text
                              style={{
                                fontSize: 12,
                                color: 'gray',
                                textDecorationLine: 'none',
                                fontWeight: 'normal',
                              }}
                            >
                              ({lang('Notebook Mode')} - {lang(nb.option?.NOTEBOOK_TYPE || '')})
                            </Text>
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            setEditingNotebookId(nb.id);
                            setNewNotebookTitle(nb.title);
                            setNewNotebookDescription(nb.description || '');
                            setNewNotebookType(nb.option?.NOTEBOOK_TYPE || 'WORKSPACE');
                            setIsAddingNotebook(false);
                          }}
                        >
                          <Text style={{ color: '#3498DB', paddingHorizontal: 8 }}>
                            {lang('Edit')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteNotebook.mutate(nb.id)}>
                          <Text style={{ color: '#d9534f', paddingHorizontal: 8 }}>
                            {lang('Delete')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <Text
                        style={[
                          commonStyles.smallText,
                          { marginTop: 4, marginLeft: 26, color: 'gray' },
                        ]}
                      >
                        {nb.description}
                      </Text>
                    </View>
                  );
                })}

                {/* 새 노트북 추가 폼 */}
                {isAddingNotebook || editingNotebookId !== undefined ? (
                  <View
                    style={{
                      marginTop: 12,
                      padding: 12,
                      backgroundColor: commonStyles.input.backgroundColor,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: commonStyles.card.borderColor,
                    }}
                  >
                    <TextInput
                      style={[
                        commonStyles.input,
                        { marginBottom: 12, backgroundColor: 'transparent' },
                      ]}
                      placeholder={lang('Enter Notebook Title')}
                      placeholderTextColor={commonStyles.placeholder.color}
                      value={newNotebookTitle}
                      onChangeText={setNewNotebookTitle}
                    />
                    <TextInput
                      style={[
                        commonStyles.input,
                        { marginBottom: 12, backgroundColor: 'transparent' },
                      ]}
                      placeholder={lang('Enter Notebook Description')}
                      placeholderTextColor={commonStyles.placeholder.color}
                      value={newNotebookDescription}
                      onChangeText={setNewNotebookDescription}
                    />
                    <Text style={[commonStyles.smallText, { marginBottom: 4 }]}>
                      {lang('Select Sub-mode:')}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
                      {availableNotebookTypes.map((type) => (
                        <OptionButton
                          key={type}
                          title={lang(type)}
                          active={newNotebookType === type}
                          onPress={() => setNewNotebookType(type)}
                        />
                      ))}
                    </View>
                    <Text style={[commonStyles.smallText, { marginBottom: 12, color: 'gray' }]}>
                      {lang(
                        newNotebookType === 'WORKSPACE' || newNotebookType === 'PRIVATE_WORKSPACE'
                          ? 'An integrated environment with all features including boards.'
                          : 'An environment managed by dynamically added notebooks with isolated namespaces.'
                      )}
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                      <TouchableOpacity
                        onPress={() => {
                          setIsAddingNotebook(false);
                          setEditingNotebookId(undefined);
                          setNewNotebookTitle('');
                          setNewNotebookDescription('');
                          setNewNotebookType('WORKSPACE');
                        }}
                        style={{ marginRight: 16, padding: 8 }}
                      >
                        <Text style={commonStyles.smallText}>{lang('cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          if (newNotebookTitle.trim()) {
                            createNotebook.mutate({
                              id: editingNotebookId,
                              title: newNotebookTitle,
                              description: newNotebookDescription,
                              notebookType: newNotebookType,
                            });
                            setNewNotebookTitle('');
                            setNewNotebookDescription('');
                            setNewNotebookType('WORKSPACE');
                            setIsAddingNotebook(false);
                            setEditingNotebookId(undefined);
                          } else {
                            Alert.alert(lang('error'), lang('Please enter a notebook title.'));
                          }
                        }}
                        style={{ padding: 8 }}
                      >
                        <Text style={{ color: '#3498DB', fontWeight: 'bold' }}>
                          {lang(editingNotebookId ? 'Edit' : 'Add')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{ marginTop: 12, paddingVertical: 8 }}
                    onPress={() => setIsAddingNotebook(true)}
                  >
                    <Text style={{ color: '#3498DB', fontWeight: '500' }}>
                      + {lang('Add Notebook Mode')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Private Mode 설정 영역 */}
              {usageMode !== 'SIMPLE' && (
                <>
                  <Text style={[commonStyles.text, { fontWeight: 'bold', marginBottom: 8 }]}>
                    {lang('Private Mode')}
                  </Text>
                  <Text style={[commonStyles.smallText, { marginBottom: 8 }]}>
                    {lang('Unlock and manage private notebooks.')}
                  </Text>
                  <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                    <OptionButton
                      title={lang('On')}
                      onPress={() => setPrivate.mutate({ enabled: true })}
                      active={privateConfig.enabled}
                    />
                    <OptionButton
                      title={lang('Off')}
                      onPress={() => setPrivate.mutate({ enabled: false })}
                      active={!privateConfig.enabled}
                    />
                  </View>

                  {!privateConfig.enabled && !auth.isLocal && (
                    <>
                      <Text
                        style={[commonStyles.smallText, { marginBottom: 8, fontStyle: 'italic' }]}
                      >
                        {lang('Require OTP for Private Mode')}
                      </Text>
                      {auth.hasOtp ? (
                        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                          <OptionButton
                            title={lang('On')}
                            onPress={() => setPrivateOtp.mutate(true)}
                            active={!!privateOtp?.value}
                          />
                          <OptionButton
                            title={lang('Off')}
                            onPress={() => setPrivateOtp.mutate(false)}
                            active={!privateOtp?.value}
                          />
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                          <OptionButton
                            title={lang('OTP (2단계 인증)')}
                            onPress={() => setModal(AccountEditModal, { openOtp: true })}
                            active={false}
                          />
                        </View>
                      )}
                    </>
                  )}

                  {!privateConfig.enabled && (
                    <>
                      <Text
                        style={[commonStyles.smallText, { marginBottom: 8, fontStyle: 'italic' }]}
                      >
                        {lang('Auto-unlock (10 mins)')}
                      </Text>
                      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                        <OptionButton
                          title={lang('On')}
                          onPress={() => setPrivate.mutate({ autoUnlock: true })}
                          active={privateConfig.autoUnlock}
                        />
                        <OptionButton
                          title={lang('Off')}
                          onPress={() => setPrivate.mutate({ autoUnlock: false })}
                          active={!privateConfig.autoUnlock}
                        />
                      </View>
                    </>
                  )}
                </>
              )}
            </View>
          )}
        </ConfigSection>
      </View>
      {usageMode !== 'SIMPLE' && (
        <>
          {extension.feature.elements('config')}
          <View style={commonStyles.card}>
            <ConfigSection
              title={lang('* Extension Settings')}
              onPress={() => navigation.push('Extension')}
            />
          </View>
        </>
      )}
      <View style={commonStyles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ConfigSection title={lang('* Account Settings')} />
          {!auth.isLocal && (
            <Text numberOfLines={1} ellipsizeMode="tail" style={{ marginLeft: 4 }}>
              - {auth.user?.username}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row' }}>
          {!!auth.user && (
            <OptionButton
              title={lang('My Account')}
              onPress={() => auth.isLocal && dispatch({ type: 'LOGOUT_LOCAL' })}
              active={!auth.isLocal}
            />
          )}
          <OptionButton
            title={lang('Local Account')}
            onPress={() => !auth.isLocal && dispatch({ type: 'LOGIN_LOCAL' })}
            active={!!auth.isLocal}
          />
          {auth.user ? (
            !auth.isLocal && (
              <>
                <OptionButton
                  title={lang('Edit Account')}
                  onPress={() => setModal(AccountEditModal, {})}
                  active={false}
                />
                <OptionButton
                  title={lang('Sign out')}
                  onPress={() => dispatch({ type: 'LOGOUT_REQUEST' })}
                  active={false}
                />
              </>
            )
          ) : (
            <OptionButton
              title={lang('Sign in')}
              onPress={() => dispatch({ type: 'LOGOUT_LOCAL' })}
              active={false}
            />
          )}
        </View>
      </View>
    </View>
  );
};
