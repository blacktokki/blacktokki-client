import { useColorScheme, useResizeContext, View, Text, useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, ScrollView } from 'react-native';
import { Card } from 'react-native-paper';

import { useNotePages } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';
import { toRecentContents } from './home/ContentGroupSection';
import { Paragraph } from '../../components/HeaderSelectBar';

const updatedOffset = new Date().getTimezoneOffset();

export const updatedFormat = (_updated: string) => {
  const _date = new Date(_updated);
  _date.setMinutes(_date.getMinutes() - updatedOffset);
  const updated = _date.toISOString().slice(0, 16);
  const date = updated.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return date === today ? updated.slice(11) : date;
};

function removeAttributesRecursively(element: Element) {
  const attributes = Array.from(element.attributes); // 반복 중 변경 방지용 복사

  for (const attr of attributes) {
    if (attr.name === 'href') {
      element.setAttribute('href', '');
    } else {
      element.removeAttribute(attr.name);
    }
  }

  // 자식 요소들에 대해 재귀 호출
  for (const child of element.children as unknown as Element[]) {
    removeAttributesRecursively(child);
  }
}

function removeAllAttributesFromHTML(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // body 하위 요소에 대해서만 처리
  const body = doc.body;
  for (const child of body.children as unknown as Element[]) {
    removeAttributesRecursively(child);
  }

  return body.innerHTML;
}

const _zoomOut = (isLandscape: boolean) => (isLandscape ? 1 : 1);

type BaseItem = {
  title: string;
  description?: string;
  updated?: string;
  paragraph?: Paragraph & { origin: string };
};

type Scale = Record<'landscape' | 'portrait', { maxWidth: number; padding: number }>;

type Item = { scale: Scale } & (
  | (BaseItem & {
      descriptionComponent: JSX.Element;
      onPress: () => void;
    })
  | { title?: undefined }
);

const CardPage = React.memo(({ item, index }: { item: Item; index: number }) => {
  const window = useResizeContext();
  const cardMaxWidth = item.scale[window].maxWidth;
  const cardPadding = item.scale[window].padding;
  const zoomOut = _zoomOut(window === 'landscape');
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const fSize = window === 'landscape' ? 2 : 0;
  const [mounted, setMounted] = useState(index < 10);

  useEffect(() => {
    if (!mounted) {
      const timer = setTimeout(() => setMounted(true), 50 * index - 400);
      return () => clearTimeout(timer);
    }
  }, [item, index, mounted]);

  if (item.title === undefined) {
    return (
      <View
        style={{
          flexBasis: window === 'landscape' ? '33%' : '50%',
          maxWidth: cardMaxWidth,
          backgroundColor: 'transparent',
        }}
      />
    );
  }
  return (
    <TouchableOpacity
      style={{
        flexBasis: window === 'landscape' ? '33%' : '50%',
        padding: cardPadding,
        paddingRight: 0,
        minWidth: cardMaxWidth,
        maxWidth: cardMaxWidth,
      }}
      onPress={item.onPress}
    >
      <Card
        onPress={item.onPress}
        style={[
          commonStyles.card,
          {
            padding: 8 + cardPadding * 0.4,
            paddingTop: 0,
            aspectRatio: item.updated || window === 'landscape' ? 1 / Math.sqrt(2) : Math.sqrt(2),
            borderRadius: 6,
            marginVertical: 10,
            marginHorizontal: 8,
            overflow: 'hidden',
          },
        ]}
      >
        <Card.Content
          style={{
            width: (zoomOut * 100 + '%') as `${number}%`,
            transformOrigin: 'left top',
            transform: [{ scale: 1 / zoomOut }],
            padding: 0,
          }}
        >
          {mounted && item.descriptionComponent}
        </Card.Content>
      </Card>
      <View
        style={{
          flexDirection: 'row',
          marginTop: 10,
          padding: 0,
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          backgroundColor: 'transparent',
        }}
      >
        <Text style={{ fontSize: 14 + fSize, overflow: 'hidden' }}>{item.title}</Text>
        {item.updated && (
          <Text style={{ fontSize: 12 + fSize, opacity: 0.4, textAlign: 'right' }}>
            {updatedFormat(item.updated)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

export const renderCardPage = ({ item, index }: { item: Item; index: number }) => (
  <CardPage key={index} index={index} item={item} />
);

export const useToCardPage = (onPress: (item: BaseItem) => void, scale: Scale) => {
  const window = useResizeContext();
  const zoomOut = _zoomOut(window === 'landscape');
  const RenderHtml = useMemo(() => React.lazy(() => import('react-native-render-html')), []);
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  return useCallback(
    (v: BaseItem) => ({
      ...v,
      descriptionComponent: (
        <RenderHtml
          source={{
            html:
              removeAllAttributesFromHTML(v.description || '').slice(0, 300 * zoomOut * zoomOut) ||
              '',
          }}
          renderersProps={{
            a: { onPress: () => onPress(v) },
          }}
          tagsStyles={{ body: { color: commonStyles.text.color } }}
          contentWidth={scale[window].maxWidth}
        />
      ),
      onPress: () => onPress(v),
      scale,
    }),
    [zoomOut, onPress, commonStyles, scale]
  );
};

const defaultScale: Scale = {
  landscape: {
    maxWidth: 250,
    padding: 20,
  },
  portrait: {
    maxWidth: 190,
    padding: 4,
  },
};

export const RecentPagesSection = React.memo(() => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const window = useResizeContext();
  const { lang } = useLangContext();
  const { data: recentPages = [], isLoading } = useNotePages();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const toCardPage = useToCardPage(
    (v) => navigation.push('NotePage', { title: v.title }),
    defaultScale
  );
  const contents = useMemo(
    () => [
      ...toRecentContents(recentPages).map(toCardPage),
      { scale: defaultScale },
      { scale: defaultScale },
    ],
    [recentPages]
  );
  const maxWidth = (defaultScale[window].maxWidth + 5) * (window === 'landscape' ? 5 : 3);
  return isLoading ? (
    <View style={commonStyles.container}>
      <View style={[commonStyles.card, commonStyles.centerContent]}>
        <Text style={commonStyles.text}>로딩 중...</Text>
      </View>
    </View>
  ) : contents.length > 2 ? (
    <ScrollView
      key={window}
      contentContainerStyle={{
        alignSelf: 'center',
        backgroundColor: 'transparent',
        flexBasis: '100%',
        maxWidth,
        flexWrap: 'wrap',
        flexDirection: 'row',
        paddingRight: defaultScale[window].padding,
        justifyContent: window === 'landscape' ? undefined : 'center',
      }}
    >
      <Suspense>{contents.map((item, index) => renderCardPage({ item, index }))}</Suspense>
    </ScrollView>
  ) : (
    <View style={commonStyles.container}>
      <View style={[commonStyles.card, commonStyles.centerContent]}>
        <Text style={commonStyles.text}>{lang('There are no recently modified notes.')}</Text>
        <TouchableOpacity
          onPress={() => navigation.push('NoteViewer', { key: 'Usage' })}
          style={commonStyles.button}
        >
          <Text style={commonStyles.buttonText}>{lang('Usage')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});
