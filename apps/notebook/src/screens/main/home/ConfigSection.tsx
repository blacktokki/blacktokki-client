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
import { View } from 'react-native';

import { SearchList } from '../../../components/SearchBar';
import { useExtension } from '../../../hooks/useExtension';
import { useKeywords, useResetKeyowrd } from '../../../hooks/useKeywordStorage';
import {
  usePrivate,
  usePrivateOtp,
  useSetPrivate,
  useSetPrivateOtp,
} from '../../../hooks/usePrivate';
import AccountEditModal from '../../../modals/AccountEditModal';
import { createCommonStyles } from '../../../styles';
import { NavigationParamList } from '../../../types';

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
  const [noteConfig, setNoteConfig] = useState<'search' | 'private'>();
  const { setModal } = useModalsContext();
  const { data: keywords = [] } = useKeywords();
  const resetKeyword = useResetKeyowrd();
  const { data: privateConfig } = usePrivate();
  const { data: privateOtp } = usePrivateOtp();
  const setPrivate = useSetPrivate();
  const setPrivateOtp = useSetPrivateOtp();
  const { data: extension } = useExtension();

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
              title={lang('Search History')}
              onPress={() => setNoteConfig(noteConfig === 'search' ? undefined : 'search')}
              active={noteConfig === 'search'}
            />
            <OptionButton
              title={lang('Private Mode')}
              onPress={() => setNoteConfig(noteConfig === 'private' ? undefined : 'private')}
              active={noteConfig === 'private'}
            />
            {!auth.isLocal && (
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
          {noteConfig === 'private' && (
            <View style={{ marginTop: 12 }}>
              <Text style={[commonStyles.smallText, { marginBottom: 8, fontStyle: 'italic' }]}>
                {lang('Private Mode')}
                {' : '}
                {lang('Visibility of notes and subnotes starting with "."')}
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
                  <Text style={[commonStyles.smallText, { marginBottom: 8, fontStyle: 'italic' }]}>
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
                  <Text style={[commonStyles.smallText, { marginBottom: 8, fontStyle: 'italic' }]}>
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
            </View>
          )}
        </ConfigSection>
      </View>
      {extension.feature.configs}
      <View style={commonStyles.card}>
        <ConfigSection
          title={lang('* Extension Settings')}
          onPress={() => navigation.push('Extension')}
        />
      </View>
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
