import { useColorScheme, useLangContext, useResizeContext } from '@blacktokki/core';
import { EditorViewer } from '@blacktokki/editor';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import DiffMatchPatch from 'diff-match-patch';
import React, { Suspense, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { onLink } from './SearchBar';
import { createCommonStyles } from '../styles';
import { NavigationParamList } from '../types';

export type ChangedItem = {
  title: string;
  newDescription: string;
  oldNotebookName?: string;
  newNotebookName?: string;
} & (
  | {
      renderType: 'diff';
      fetchType: 'part';
      paragraph?: string;
      description: string;
    }
  | {
      renderType: 'plain';
      fetchType: 'part';
    }
  | {
      renderType: 'override';
      fetchType: 'part';
      description: string;
    }
  | {
      renderType: 'plain';
      fetchType: 'move' | 'override';
      newTitle: string;
    }
  | {
      renderType: 'override';
      fetchType: 'override';
      description: string;
      newTitle: string;
    }
);
const getHtmlSplitDiff = (text1: string, text2: string, theme: 'light' | 'dark'): string => {
  const dmp = new DiffMatchPatch();

  // <a> 태그뿐만 아니라 다른 인라인 포맷팅 태그들도 내용을 통째로 하나의 토큰으로 묶어 깨짐 방지
  const tokenizer = /(<(a|strong|em|code|span|b|i|u|del|s)\b[^>]*>[\s\S]*?<\/\2>|<[^>]+>|[^<]+)/gi;
  const lineArray: string[] = [];
  const lineHash: { [key: string]: number } = {};

  const tokensToChars = (text: string): string => {
    const tokens = text.match(tokenizer) || [];
    let chars = '';
    for (const token of tokens) {
      if (Object.prototype.hasOwnProperty.call(lineHash, token)) {
        chars += String.fromCharCode(lineHash[token]);
      } else {
        const code = lineArray.length;
        lineArray[code] = token;
        lineHash[token] = code;
        chars += String.fromCharCode(code);
      }
    }
    return chars;
  };

  const chars1 = tokensToChars(text1);
  const chars2 = tokensToChars(text2);

  const diffs = dmp.diff_main(chars1, chars2);
  dmp.diff_cleanupSemantic(diffs);

  interface DiffBlock {
    op: number;
    text: string;
  }

  const blocks: DiffBlock[] = [];

  for (const [op, data] of diffs) {
    let text = '';
    for (let i = 0; i < data.length; i++) {
      text += lineArray[data.charCodeAt(i)];
    }

    if (blocks.length > 0 && blocks[blocks.length - 1].op === op) {
      blocks[blocks.length - 1].text += text;
    } else {
      blocks.push({ op, text });
    }
  }

  const colors =
    theme === 'dark'
      ? {
          containerBg: '#1e1e1e',
          text: '#d4d4d4',
          border: '#333333',
          delBg: '#451818',
          insBg: '#183818',
          emptyBg: '#252526',
        }
      : {
          containerBg: '#FAFAFA',
          text: '#454545',
          border: '#E0E0E0',
          delBg: '#F2D7D7',
          insBg: '#D7F2D7',
          emptyBg: '#F5F5F5',
        };

  const rowStyle = `display: flex; flex-direction: row; align-items: stretch; border-bottom: 1px solid ${colors.border}; background-color: ${colors.containerBg};`;
  const cellStyle = `flex: 1; padding: 1rem; overflow: hidden; word-wrap: break-word; color: ${colors.text};`;

  const createRow = (
    leftContent: string,
    rightContent: string,
    leftBg: string = '',
    rightBg: string = ''
  ) => {
    const lStyle = `${cellStyle} background-color: ${leftBg || 'transparent'};`;
    const rStyle = `${cellStyle} background-color: ${rightBg || 'transparent'};`;

    return `
      <div class="diff-row" style="${rowStyle}">
        <div class="diff-cell left" style="${lStyle}">${leftContent}</div>
        <div class="diff-cell right" style="${rStyle}">${rightContent}</div>
      </div>`;
  };

  let resultHtml = '';
  let i = 0;

  while (i < blocks.length) {
    const current = blocks[i];
    const next = i + 1 < blocks.length ? blocks[i + 1] : null;

    if (current.op === 0) {
      resultHtml += createRow(current.text, current.text);
      i++;
    } else if (current.op === -1 && next && next.op === 1) {
      resultHtml += createRow(current.text, next.text, colors.delBg, colors.insBg);
      i += 2;
    } else if (current.op === -1) {
      resultHtml += createRow(current.text, '', colors.delBg, colors.emptyBg);
      i++;
    } else if (current.op === 1) {
      resultHtml += createRow('', current.text, colors.emptyBg, colors.insBg);
      i++;
    }
  }

  return `<div class="diff-container" style="width: 100%; background-color: ${colors.containerBg};">${resultHtml}</div>`;
};

const DiffPreview = React.memo(
  ({ source, target, theme }: { source?: string; target: string; theme: 'light' | 'dark' }) => {
    const RenderHtml = React.lazy(() => import('react-native-render-html'));
    const _window = useResizeContext();

    const diffRows = useMemo(() => {
      if (!source) return { html: '' };
      return { html: getHtmlSplitDiff(source, target, theme) };
    }, [source, target, theme]);
    return (
      <Suspense>
        <RenderHtml source={diffRows} contentWidth={_window === 'landscape' ? 360 : 260} />
      </Suspense>
    );
  }
);

export default ({ item }: { item: ChangedItem }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();

  const errorColor = '#d9534f';

  return (
    <View
      style={[
        commonStyles.card,
        { padding: 0, overflow: 'hidden' },
        item.renderType === 'override' ? { borderColor: errorColor } : {},
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setIsExpanded(!isExpanded)}
        style={[
          commonStyles.row,
          {
            padding: 12,
            backgroundColor: commonStyles.card.backgroundColor,
            borderBottomWidth: isExpanded ? 1 : 0,
            borderBottomColor: commonStyles.card.borderColor,
          },
        ]}
      >
        <Icon
          name={isExpanded ? 'chevron-down' : 'chevron-right'}
          size={12}
          color={commonStyles.text.color}
          style={{ width: 16 }}
        />
        <Icon
          name="file-text-o"
          size={14}
          color={commonStyles.text.color}
          style={{ marginLeft: 8 }}
        />
        <Text style={[commonStyles.smallText, { marginLeft: 8, flex: 1 }]} numberOfLines={1}>
          {item.title}
          {item.oldNotebookName ? ` (${item.oldNotebookName})` : ''}
          {item.fetchType !== 'part' || item.oldNotebookName !== item.newNotebookName ? ' ➜ ' : ''}
          {item.fetchType !== 'part' || item.oldNotebookName !== item.newNotebookName ? (
            <Text>
              {'newTitle' in item ? item.newTitle : item.title}
              {item.newNotebookName ? ` (${item.newNotebookName})` : ''}
            </Text>
          ) : null}
        </Text>

        {item.renderType === 'override' && (
          <Text style={[commonStyles.smallText, { color: errorColor, marginLeft: 8 }]}>
            {lang('This note already exists.')}
          </Text>
        )}
      </TouchableOpacity>

      {isExpanded &&
        ('description' in item ? (
          <DiffPreview source={item.description} target={item.newDescription} theme={theme} />
        ) : (
          <EditorViewer
            active
            value={item.newDescription}
            theme={theme}
            onLink={(url) => onLink(url, navigation)}
            autoResize
          />
        ))}
    </View>
  );
};
