import { useResizeContext, Text } from '@blacktokki/core';
import { cleanHtml } from '@blacktokki/editor';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Card } from 'react-native-paper';
import Icon2 from 'react-native-vector-icons/MaterialCommunityIcons';

import { updatedFormat } from './home/ContentGroupSection';
import { Paragraph } from '../../components/HeaderSelectBar';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';

export const _zoomOut = (isLandscape: boolean) => (isLandscape ? 1 : 1);

export type BaseItem = {
  title: string;
  description?: string;
  updated?: string;
  subNoteCount?: number;
  paragraph?: Paragraph & { origin: string };
};

export type Scale = Record<'landscape' | 'portrait', { maxWidth: number; padding: number }>;

export type Item = { scale: Scale } & (
  | (BaseItem & {
      descriptionComponent: React.JSX.Element;
      onPress: () => void;
    })
  | { title?: undefined }
);

const CardPage = React.memo(({ item, index }: { item: Item; index: number }) => {
  const window = useResizeContext();
  const cardMaxWidth = item.scale[window].maxWidth;
  const cardPadding = item.scale[window].padding;
  const zoomOut = _zoomOut(window === 'landscape');
  const { commonStyles } = useNotebookTheme();
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
          minWidth: cardMaxWidth,
          maxWidth: cardMaxWidth,
          backgroundColor: 'transparent',
        }}
      />
    );
  }
  const subNoteCount = item.subNoteCount || 0;
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
      <View style={styles.cardContainer}>
        {Array.from(Array(3).keys()).map(
          (v) =>
            subNoteCount > v && (
              <View
                key={v}
                style={[
                  commonStyles.card,
                  styles.stackLayer,
                  { top: -4 * (v + 1), left: 3 * (v + 1), zIndex: -(v + 1) },
                ]}
              />
            )
        )}

        <Card
          onPress={item.onPress}
          style={[
            commonStyles.card,
            styles.card,
            {
              padding: 8 + cardPadding * 0.4,
              aspectRatio: item.updated || window === 'landscape' ? 1 / Math.sqrt(2) : Math.sqrt(2),
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
      </View>
      <View style={styles.cardLabel}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Text style={{ fontSize: 14 + fSize, overflow: 'hidden' }} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
        {subNoteCount > 0 ? (
          <Text style={{ fontSize: 12 + fSize, opacity: 0.4, textAlign: 'right' }}>
            ( {1 + subNoteCount} )
          </Text>
        ) : (
          item.updated && (
            <Text style={{ fontSize: 12 + fSize, opacity: 0.4, textAlign: 'right' }}>
              {updatedFormat(item.updated)}
            </Text>
          )
        )}
      </View>
    </TouchableOpacity>
  );
});

export const renderCardPage = ({ item, index }: { item: Item; index: number }) => (
  <CardPage key={index} index={index} item={item} />
);

const RenderHtml = React.lazy(() => import('react-native-render-html'));

const CardDescriptionHtml = React.memo(
  ({
    item,
    description,
    onPress,
    maxWidth,
    zoomOut,
    borderColor,
    smallTextColor,
    textColor,
  }: {
    item: BaseItem;
    description: string;
    onPress: (item: BaseItem) => void;
    maxWidth: number;
    zoomOut: number;
    borderColor: string;
    smallTextColor: string;
    textColor: string;
  }) => {
    const onPressRef = useRef(onPress);
    onPressRef.current = onPress;
    const itemRef = useRef(item);
    itemRef.current = item;

    const handleAnchorPress = useCallback(() => {
      onPressRef.current(itemRef.current);
    }, []);

    const source = useMemo(
      () => ({
        html:
          cleanHtml(description || '', false, false, false).slice(0, 300 * zoomOut * zoomOut) || '',
      }),
      [description, zoomOut]
    );

    const renderersProps = useMemo(
      () => ({
        a: { onPress: handleAnchorPress },
      }),
      [handleAnchorPress]
    );

    const tagsStyles = useMemo(
      () => ({
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: borderColor || '#cccccc',
          paddingLeft: 6,
          paddingVertical: 0,
          marginVertical: 0,
          marginLeft: 0,
          marginRight: 0,
          color: smallTextColor || '#777777',
          fontStyle: 'italic' as const,
        },
        body: {
          color: textColor,
        },
      }),
      [borderColor, smallTextColor, textColor]
    );

    if (!description || !description.trim()) {
      const displayTitle = item.title ? item.title.split('/').pop() : '';
      return (
        <View
          style={{
            height: 100,
            justifyContent: 'center',
            alignItems: 'center',
            opacity: 0.3,
            paddingHorizontal: 12,
          }}
        >
          <Icon2 name="view-dashboard" size={40} color={textColor} style={{ marginBottom: 6 }} />
          <Text
            style={{ color: textColor, fontSize: 15, fontWeight: '600', textAlign: 'center' }}
            numberOfLines={2}
          >
            {displayTitle}
          </Text>
        </View>
      );
    }

    return (
      <RenderHtml
        source={source}
        renderersProps={renderersProps}
        tagsStyles={tagsStyles}
        contentWidth={maxWidth}
      />
    );
  }
);

export const useToCardPage = (
  onPress: (item: BaseItem) => void,
  scale: Scale,
  renderTitle?: (item: BaseItem) => string
) => {
  const window = useResizeContext();
  const zoomOut = _zoomOut(window === 'landscape');
  const { commonStyles } = useNotebookTheme();
  const borderColor = commonStyles.card.borderColor || '#cccccc';
  const smallTextColor = commonStyles.smallText.color || '#777777';
  const textColor = commonStyles.text.color;

  return useCallback(
    (v: BaseItem) => ({
      ...v,
      title: renderTitle ? renderTitle(v) : v.title,
      descriptionComponent: (
        <CardDescriptionHtml
          item={v}
          description={v.description || ''}
          onPress={onPress}
          maxWidth={scale[window].maxWidth}
          zoomOut={zoomOut}
          borderColor={borderColor}
          smallTextColor={smallTextColor}
          textColor={textColor}
        />
      ),
      onPress: () => onPress(v),
      scale,
    }),
    [zoomOut, onPress, scale, window, borderColor, smallTextColor, textColor, renderTitle]
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 6,
    marginVertical: 10,
    marginHorizontal: 8,
  },
  card: {
    overflow: 'hidden',
    paddingTop: 0,
    marginBottom: 0,
  },
  cardLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    backgroundColor: 'transparent',
  },
  stackLayer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    padding: 0,
    margin: 0,
    opacity: 0.4,
  },
});
