import { useLangContext, Text } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useNotebookTheme } from '../hooks/useNotebookTheme';
import { NavigationParamList } from '../types';

export default ({ paragraph, compact }: { paragraph: string; compact?: boolean }) => {
  const { lang } = useLangContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { commonStyles } = useNotebookTheme();
  return (
    <View
      style={[
        usageButtonStyles.container,
        compact && usageButtonStyles.compactContainer,
        { backgroundColor: commonStyles.container.backgroundColor },
      ]}
    >
      <TouchableOpacity
        onPress={() =>
          navigation.push('NoteViewer', {
            key: 'Usage',
            paragraph,
          })
        }
        style={[
          usageButtonStyles.action,
          compact && usageButtonStyles.compactAction,
          compact && usageButtonStyles.inlineAction,
        ]}
        hitSlop={compact ? { top: 4, bottom: 4 } : undefined}
      >
        <Text
          style={
            compact
              ? [usageButtonStyles.compactCaption, { color: commonStyles.text.color }]
              : usageButtonStyles.caption
          }
        >
          {lang('Usage')}
        </Text>
        <Icon
          name="chevron-right"
          style={!compact && usageButtonStyles.icon}
          size={12}
          color={commonStyles.text.color}
        />
      </TouchableOpacity>
    </View>
  );
};

/** Compact metrics align adjacent screen actions without changing other extensions' Usage buttons. */
export const usageButtonStyles = StyleSheet.create({
  container: {
    padding: 4,
    paddingBottom: 0,
    paddingTop: 10,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  action: { flexDirection: 'row', alignItems: 'center' },
  caption: { marginRight: 6 },
  icon: { marginRight: 20 },
  compactContainer: { padding: 0, paddingTop: 0 },
  compactAction: {
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  compactCaption: { fontSize: 14, lineHeight: 20 },
  // Header navigation uses a text-sized row; form actions retain their larger button metrics.
  inlineAction: {
    minHeight: 24,
    paddingHorizontal: 6,
    paddingVertical: 0,
    borderRadius: 4,
    gap: 4,
  },
});
