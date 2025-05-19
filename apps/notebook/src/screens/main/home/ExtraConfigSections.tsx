import { useAuthContext } from '@blacktokki/account';
import { Colors, TextButton, useColorScheme, useLangContext, Text } from '@blacktokki/core';
import { ConfigSections } from '@blacktokki/navigation';
import { useNavigation } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';

import { SearchList } from '../../../components/SearchBar';
import { useKeywords, useResetKeyowrd } from '../../../hooks/useKeywordStorage';
import { createCommonStyles } from '../../../styles';
import { NavigationParamList } from '../../../types';

const ConfigButton = (props: { title: string; onPress?: () => void }) => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const color = Colors[theme].text;
  return (
    <TouchableOpacity
      style={[commonStyles.header, { marginBottom: 0 }]}
      onPress={props.onPress}
      disabled={!props.onPress}
    >
      <Text style={{ fontSize: 20, color, fontWeight: '600' }}>{props.title}</Text>
      {props.onPress && <Text>{'>'}</Text>}
    </TouchableOpacity>
  );
};

const OptionButton = (props: { title: string; onPress: () => void; active: boolean }) => {
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
  const [search, setSearch] = useState(false);
  const { data: keywords = [] } = useKeywords();
  const resetKeyword = useResetKeyowrd();
  return (
    <View>
      <View style={commonStyles.card}>
        <ConfigSections />
      </View>
      <View style={commonStyles.card}>
        <ConfigButton title={lang('* Search Settings')} />
        <View style={{ flexDirection: 'row' }}>
          <OptionButton
            title={'Search History'}
            onPress={() => setSearch(!search)}
            active={search}
          />
          {search && !!keywords.length && (
            <OptionButton title={'Clear'} onPress={() => resetKeyword.mutate()} active={false} />
          )}
        </View>
        {search && (
          <View style={[commonStyles.card, { padding: 0 }]}>
            <SearchList
              filteredPages={keywords}
              handlePagePress={(title, section) => navigation.push('NotePage', { title, section })}
            />
          </View>
        )}
      </View>
      <View style={commonStyles.card}>
        <ConfigButton title={lang('* Archive')} onPress={() => navigation.push('Archive', {})} />
      </View>
      <View style={commonStyles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ConfigButton title={lang('* Account Settings')} />
          {!auth.isLocal && (
            <Text numberOfLines={1} ellipsizeMode="tail" style={{ marginLeft: 4 }}>
              - {auth.user?.username}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row' }}>
          {!!auth.user && (
            <OptionButton
              title={'My Account'}
              onPress={() => auth.isLocal && dispatch({ type: 'LOGOUT_LOCAL' })}
              active={!auth.isLocal}
            />
          )}
          <OptionButton
            title={'Local Account'}
            onPress={() => !auth.isLocal && dispatch({ type: 'LOGIN_LOCAL' })}
            active={!!auth.isLocal}
          />
          {auth.user ? (
            <OptionButton
              title={'Logout'}
              onPress={() => dispatch({ type: 'LOGOUT_REQUEST' })}
              active={false}
            />
          ) : (
            <OptionButton
              title={'Login'}
              onPress={() => dispatch({ type: 'LOGOUT_LOCAL' })}
              active={false}
            />
          )}
        </View>
      </View>
    </View>
  );
};
