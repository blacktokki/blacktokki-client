import { useColorScheme, useLangContext, Spacer, CommonButton } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';

import { useQuickMemoSelection, useSetQuickMemoSelection } from './useQuickMemoStorage';
import HeaderSelectBar, {
  base64Decode,
  parseHtmlToParagraphs,
} from '../../components/HeaderSelectBar';
import { SearchBar, titleFormat } from '../../components/SearchBar';
import { useNotePage, useCreateOrUpdatePage } from '../../hooks/useNoteStorage';
import { EditPageSection } from '../../screens/main/EditPageScreen';
import { HeaderIconButton } from '../../screens/main/NoteItemSections';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

const pathToTitle = (path?: string) => {
  if (!path) return undefined;
  try {
    const parts = path.split(',');
    return base64Decode(parts[parts.length - 1]);
  } catch {
    return undefined;
  }
};

export const QuickMemoScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();

  const { data: history = [] } = useQuickMemoSelection();
  const { mutate: setSelection } = useSetQuickMemoSelection();
  const mutation = useCreateOrUpdatePage();
  const quickMemo = lang('Quick Memo');
  const [title, setTitle] = useState(quickMemo);
  const [targetPath, setTargetPath] = useState<string | undefined>(undefined);
  const [memoTitle, setMemoTitle] = useState('');
  const [content, setContent] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(true);

  const { data: page } = useNotePage(title);
  const paragraphs = useMemo(
    () => parseHtmlToParagraphs(page?.description || ''),
    [page?.description]
  );

  const targetItem = useMemo(
    () => paragraphs.find((p) => p.path === targetPath),
    [paragraphs, targetPath]
  );
  const memoLevel = Math.min((targetItem?.level || 3) + 1, 6);
  const memoExists = paragraphs.find((p) => p.title === memoTitle && p.level === memoLevel);
  const disabled = memoExists || !content.trim();

  useEffect(() => {
    if (history.length > 0) {
      setTitle(history[0].title);
      setTargetPath(history[0].path);
    } else if (title !== quickMemo) {
      setTitle(quickMemo);
      setTargetPath(undefined);
    }
  }, [history, quickMemo]);

  const handleSave = async () => {
    if (disabled) return;

    const splitIndex = paragraphs.findLastIndex((p) => p.path === (targetPath || ''));
    const memoContent = memoTitle
      ? `<h${memoLevel}>${memoTitle}</h${memoLevel}>${content}`
      : content;

    const finalDescription = [
      ...paragraphs.slice(0, splitIndex + 1).map((p) => p.header + p.description),
      memoContent,
      ...paragraphs.slice(splitIndex + 1).map((p) => p.header + p.description),
    ].join('');

    try {
      await mutation.mutateAsync({ title, description: finalDescription });
      setSelection({ title, path: targetPath });
      setMemoTitle('');
      setContent('');
      setIsCollapsed(true);
      navigation.navigate('NotePage', { title, paragraph: memoTitle || undefined });
    } catch (e: any) {}
  };

  const handleCancel = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Home');
  };

  return (
    <View style={commonStyles.container}>
      <TouchableOpacity
        style={[
          commonStyles.header,
          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        ]}
        onPress={() => setIsCollapsed(!isCollapsed)}
      >
        <Text style={[commonStyles.title, { marginTop: 0, marginBottom: 4, flex: 1 }]}>
          {titleFormat({
            title,
            paragraph: targetItem?.level === 0 ? undefined : targetItem?.title,
          })}
          {title === quickMemo ? '' : ` - ${quickMemo}`}
        </Text>
        <HeaderIconButton
          name={isCollapsed ? 'chevron-right' : 'chevron-down'}
          onPress={() => setIsCollapsed(!isCollapsed)}
        />
      </TouchableOpacity>
      {!isCollapsed && (
        <View style={[commonStyles.card, { marginTop: 0 }]}>
          <Text style={[commonStyles.text, { marginBottom: 8 }]}>
            {lang('Note title and paragraph:')}
          </Text>
          {history.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
              {history.map((item, idx) => (
                <CommonButton
                  key={idx}
                  onPress={() => {
                    setTitle(item.title);
                    setTargetPath(item.path);
                    setIsCollapsed(true);
                  }}
                  style={[
                    {
                      paddingVertical: 4,
                      paddingHorizontal: 12,
                      marginBottom: 6,
                      marginRight: 6,
                    },
                  ]}
                  title={titleFormat({ title: item.title, paragraph: pathToTitle(item.path) })}
                />
              ))}
            </View>
          )}

          <SearchBar
            onPress={(t) => {
              setTitle(t);
              setTargetPath(undefined);
            }}
            addKeyword={false}
            useExtraSearch={false}
            useTextSearch={false}
          />

          <Spacer height={12} />
          <View style={{ maxWidth: 960 }}>
            <HeaderSelectBar
              data={paragraphs}
              path={targetPath || ''}
              root={title || '...'}
              onPress={(p) => {
                setTargetPath(p.path);
                setIsCollapsed(true);
              }}
            />
          </View>
        </View>
      )}
      <TextInput
        style={commonStyles.input}
        value={memoTitle}
        onChangeText={setMemoTitle}
        placeholder={lang('Sub-Paragraph Title') + `(H${memoLevel})`}
        placeholderTextColor={commonStyles.placeholder.color}
      />
      <EditPageSection
        title={title}
        content={content}
        setContent={setContent}
        onSave={disabled ? undefined : handleSave}
        onCancel={handleCancel}
      />
    </View>
  );
};
