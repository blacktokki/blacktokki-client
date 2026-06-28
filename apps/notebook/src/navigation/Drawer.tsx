import { useAuthContext } from '@blacktokki/account';
import { useLangContext } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, TouchableOpacity, StyleSheet, Text, View } from 'react-native';
import { List } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useExtension } from '../hooks/useExtension';
import { useNotebookTheme } from '../hooks/useNotebookTheme';
import { useLastTab } from '../hooks/useTabStorage';
import { useUsageMode } from '../hooks/useUsageMode';
import ContentGroupSection, {
  ContentGroupType,
  TabsSection,
  RenderIcon,
  ContentGroupSubType,
  CurrentTabSection,
} from '../screens/main/home/ContentGroupSection';

export default () => {
  const { lang } = useLangContext();
  const { auth } = useAuthContext();
  const { commonStyles } = useNotebookTheme();
  const { data: lastTab } = useLastTab();
  const { usageMode, isBoardEnabled } = useUsageMode();
  const { data: extension } = useExtension();
  const [currentView, setCurrentView] = useState<ContentGroupType>('RECENT');
  const [currentSubView, setCurrentSubView] = useState<ContentGroupSubType>('TOC');
  const currentNote = lastTab?.type === 'NOTE' ? lastTab : undefined;

  const renderBadge = (type: ContentGroupSubType, label: string, icon: string) => {
    const isActive = currentSubView === type;
    const tabStyles = commonStyles[isActive ? 'activeTab' : 'inactiveTab'];
    const borderColor = commonStyles.inactiveTab.color;
    return (
      <TouchableOpacity
        style={[
          styles.badge,
          {
            backgroundColor: tabStyles.backgroundColor,
            borderColor,
            borderRadius: commonStyles.button.borderRadius,
          },
        ]}
        onPress={() => setCurrentSubView(type)}
      >
        <Icon name={icon} size={14} color={tabStyles.color} style={{ marginRight: 6 }} />
        <Text
          style={{
            fontSize: 12,
            color: tabStyles.color,
            fontWeight: isActive ? 'bold' : 'normal',
            fontFamily: commonStyles.text.fontFamily,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderTab = (
    type: ContentGroupType,
    label: string,
    icon: string,
    isActive: boolean,
    disabled?: boolean
  ) => {
    const tabStyles = commonStyles[isActive ? 'activeTab' : 'inactiveTab'];

    return (
      <TouchableOpacity
        style={[styles.tabItem, tabStyles, disabled && { opacity: 0.33 }]}
        disabled={disabled}
        onPress={() => setCurrentView(type)}
      >
        <Icon name={icon} size={16} color={tabStyles.color} style={{ marginBottom: 4 }} />
        <Text
          style={{
            fontSize: 13,
            textAlign: 'center',
            fontWeight: isActive ? 'bold' : 'normal',
            color: tabStyles.color,
            fontFamily: commonStyles.text.fontFamily,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  useEffect(() => {
    if (!currentNote && currentView === 'CURRENT_NOTE') {
      setCurrentView('RECENT');
    }
  }, [currentNote, currentView === 'CURRENT_NOTE']);
  useEffect(() => {
    if (auth.isLocal && currentSubView === 'HISTORY') {
      setCurrentSubView('TOC');
    }
  }, [auth.isLocal && currentSubView]);

  return (
    <View style={commonStyles.backgroundView}>
      <List.Item
        left={RenderIcon('home')}
        title={lang('Home')}
        titleStyle={{ fontFamily: commonStyles.text.fontFamily, color: commonStyles.text.color }}
        onPress={() => push('Home')}
      />
      {extension.feature.elements('button')}
      <CurrentTabSection />
      <ScrollView style={Platform.OS === 'web' ? ({ scrollbarWidth: 'thin' } as any) : {}}>
        <TabsSection />
        {usageMode !== 'SIMPLE' ? (
          <View
            style={[
              styles.tabContainer,
              { borderBottomColor: commonStyles.separator.backgroundColor },
            ]}
          >
            {renderTab('RECENT', lang('All Notes'), 'notebook', currentView === 'RECENT')}
            {isBoardEnabled &&
              renderTab('BOARD', lang('Board'), 'view-dashboard', currentView === 'BOARD')}
            {renderTab(
              'CURRENT_NOTE',
              currentNote ? currentNote.title : lang('Current Note'),
              'file-document',
              currentView === 'CURRENT_NOTE',
              currentNote === undefined
            )}
          </View>
        ) : (
          <List.Subheader
            selectable={false}
            style={{ fontFamily: commonStyles.title.fontFamily, color: commonStyles.title.color }}
          >
            {lang('All Notes')}
          </List.Subheader>
        )}
        {usageMode !== 'SIMPLE' && currentView === 'CURRENT_NOTE' && currentNote && (
          <View style={styles.badgeContainer}>
            {renderBadge('TOC', lang('Table of Contents'), 'format-list-bulleted')}
            {renderBadge('SUBNOTE', lang('Sub Notes'), 'file-tree')}
            {!auth.isLocal && renderBadge('HISTORY', lang('Changelog'), 'clock-outline')}
          </View>
        )}
        {usageMode === 'SIMPLE' || currentView === 'RECENT' ? (
          <ContentGroupSection type={'RECENT'} noteCount={10} />
        ) : (
          <ContentGroupSection
            type={currentView === 'CURRENT_NOTE' ? currentSubView : currentView}
          />
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    marginTop: 8,
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  badgeContainer: {
    flexDirection: 'row',
    paddingLeft: 13,
    paddingTop: 16,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 4,
  },
});
