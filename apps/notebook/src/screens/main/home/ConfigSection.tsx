import { useAuthContext } from '@blacktokki/account';
import {
  TextButton,
  useLangContext,
  Text,
  useModalsContext,
  useUserColorScheme,
} from '@blacktokki/core';
import { ConfigSection, LanguageConfigSection } from '@blacktokki/navigation';
import { useNavigation } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import { ColorSchemeName, View } from 'react-native';

import { SearchList } from '../../../components/SearchBar';
import { useExtension } from '../../../hooks/useExtension';
import { useKeywords, useResetKeyowrd } from '../../../hooks/useKeywordStorage';
import { useNotebooks } from '../../../hooks/useNotebookStorage';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import {
  usePrivate,
  usePrivateOtp,
  useSetPrivate,
  useSetPrivateOtp,
} from '../../../hooks/usePrivate';
import { useSetUsageMode, useUsageMode } from '../../../hooks/useUsageMode';
import AccountEditModal from '../../../modals/AccountEditModal';
import { NavigationParamList } from '../../../types';

export const SkinConfigSection = () => {
  const { lang } = useLangContext();
  const [configTheme, setConfigTheme] = useUserColorScheme();
  const { commonStyles } = useNotebookTheme();
  const color = commonStyles.text.color;

  return (
    <ConfigSection title={lang('* 스킨 설정')}>
      <View style={{ flexDirection: 'column', gap: 12 }}>
        <View style={{ flexDirection: 'row' }}>
          {[
            [lang('Auto'), null],
            [lang('Light'), 'light'],
            [lang('Dark'), 'dark'],
          ].map(([title, scheme]) => (
            <TextButton
              key={title as string}
              title={title as string}
              textStyle={{
                fontSize: 16,
                color,
                textDecorationLine: configTheme === scheme ? 'underline' : 'none',
              }}
              style={{ borderRadius: 20 }}
              onPress={() => setConfigTheme(scheme as ColorSchemeName)}
            />
          ))}
        </View>
      </View>
    </ConfigSection>
  );
};

export const OptionButton = (props: { title: string; onPress: () => void; active: boolean }) => {
  const { commonStyles } = useNotebookTheme();
  const color = commonStyles.text.color;
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

let _noteConfig: 'search' | 'usage' | undefined = undefined;

export default () => {
  const { lang } = useLangContext();
  const { auth, dispatch } = useAuthContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { commonStyles } = useNotebookTheme();
  const [noteConfig, _setNoteConfig] = useState<'search' | 'usage' | undefined>(_noteConfig);
  const setNoteConfig = (config: 'search' | 'usage' | undefined) => {
    _noteConfig = config;
    _setNoteConfig(config);
  };
  const { setModal } = useModalsContext();
  const { data: keywords = [] } = useKeywords();
  const resetKeyword = useResetKeyowrd();
  const { data: privateConfig } = usePrivate();
  const { data: privateOtp } = usePrivateOtp();
  const setPrivate = useSetPrivate();
  const setPrivateOtp = useSetPrivateOtp();
  const { usageMode } = useUsageMode();
  const setUsageMode = useSetUsageMode();
  const { data: extension } = useExtension();

  const { data: notebooks = [] } = useNotebooks();

  const getUsageModeDescription = (mode: string) => {
    switch (mode) {
      case 'SIMPLE':
        return lang('A lightweight environment providing only essential features.');
      case 'NOTE':
        return lang('Provides all knowledge management features except boards.');
      case 'NOTEBOOK':
        return lang('An integrated environment with all features including boards.');
      default:
        return '';
    }
  };

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

          {/* 모드 설정 및 프라이빗 모드 설정 영역 */}
          {noteConfig === 'usage' && (
            <View style={{ marginTop: 12 }}>
              {/* Usage Mode 설정 (현재 선택된 모드에 대해서만 설명 표시) */}
              <Text style={[commonStyles.text, { fontWeight: 'bold', marginBottom: 4 }]}>
                {lang('Usage Mode')}
              </Text>
              <Text style={[commonStyles.smallText, { marginBottom: 8, color: 'gray' }]}>
                {usageMode && getUsageModeDescription(usageMode)}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
                <OptionButton
                  title={lang('Simple Mode')}
                  onPress={() => setUsageMode.mutate({ mode: 'SIMPLE' })}
                  active={usageMode === 'SIMPLE'}
                />
                <OptionButton
                  title={lang('Note Mode')}
                  onPress={() => setUsageMode.mutate({ mode: 'NOTE' })}
                  active={usageMode === 'NOTE'}
                />
                <OptionButton
                  title={lang('Notebook Mode')}
                  onPress={() => {
                    const firstId = notebooks[0]?.id;
                    setUsageMode.mutate({ mode: 'NOTEBOOK', notebookId: firstId });
                  }}
                  active={usageMode === 'NOTEBOOK'}
                />
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
