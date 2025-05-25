import { useAuthContext } from '@blacktokki/account';
import { Colors, TextButton, useColorScheme, useLangContext, Text } from '@blacktokki/core';
import { ConfigSections } from '@blacktokki/navigation';
import { useNavigation } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';

import { SearchList } from '../../../components/SearchBar';
import { useKeywords, useResetKeyowrd } from '../../../hooks/useKeywordStorage';
import { useCreateOrUpdatePage, useNotePages } from '../../../hooks/useNoteStorage';
import { createCommonStyles } from '../../../styles';
import { Content, NavigationParamList } from '../../../types';

const exportMarkdowns = async (contents: Content[]) => {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const content of contents.filter((v) => (v.description?.length || 0) > 0)) {
    zip.file(content.title + '.md', content.description as string);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'notebook.zip';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 500);
  a.remove();
};

const importMarkdowns = async () => {
  const files = await new Promise<File[]>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/zip,.md,.markdown'; // 특정 타입만 허용하고 싶으면 'text/plain', 'image/*' 등으로 설정
    input.style.display = 'none';
    input.multiple = true;

    input.onchange = () => {
      if (input.files && input.files.length > 0) {
        resolve(Array.from(input.files)); // File은 Blob의 하위 클래스
      } else {
        reject(new Error('파일이 선택되지 않았습니다.'));
      }
    };

    input.click(); // 파일 선택창 열기
  });
  const contents: { title: string; description: string }[] = [];
  const JSZip = (await import('jszip')).default;
  for (const file of files) {
    if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
      const zip = new JSZip();
      const files = (await zip.loadAsync(file)).files;
      for (const relativePath in files) {
        const file = zip.files[relativePath];
        if (!file.dir) {
          contents.push({
            title: relativePath.replace(/\.[^/.]+$/, ''),
            description: (await file.async('text')).toString(),
          });
        }
      }
    } else if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
      contents.push({ title: file.name.replace(/\.[^/.]+$/, ''), description: await file.text() });
    }
  }
  return contents;
};

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
  const { data: contents } = useNotePages();
  const mutation = useCreateOrUpdatePage();
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
        <ConfigButton title={lang('* Archive')} />
        <View style={{ flexDirection: 'row' }}>
          <OptionButton
            title={'Export'}
            onPress={() => contents && exportMarkdowns(contents)}
            active={false}
          />
          <OptionButton
            title={'Import'}
            onPress={() => importMarkdowns().then((v) => v.forEach((v2) => mutation.mutate(v2)))}
            active={false}
          />
          {!auth.isLocal && (
            <OptionButton
              title={'Changelog'}
              onPress={() => navigation.push('Archive', {})}
              active={false}
            />
          )}
        </View>
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
