import { useLangContext, View, useColorScheme, Colors } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { List } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useCurrentPage, useLastTab } from '../hooks/useTabStorage';
import ContentGroupSection, {
  ProblemButton,
  TimeLineButton,
  ContentGroupType,
  TabsSection,
  RenderIcon,
  ContentGroupSubType,
  CurrentTabSection,
} from '../screens/main/home/ContentGroupSection';

export default () => {
  const { lang } = useLangContext();
  const theme = useColorScheme();
  const { data: lastTab } = useLastTab();
  const currentPage = useCurrentPage(lastTab);
  const [currentView, setCurrentView] = useState<ContentGroupType>('RECENT');
  const [currentSubView, setCurrentSubView] = useState<ContentGroupSubType>('TOC');
  const currentNote = currentPage?.type === 'NOTE' ? currentPage : undefined;

  const renderBadge = (type: ContentGroupSubType, label: string, icon: string) => {
    const isActive = currentSubView === type;
    const activeColor = Colors[theme].text;
    const inactiveColor = theme === 'dark' ? '#888888' : '#666666';
    const backgroundColor = isActive ? (theme === 'dark' ? '#333333' : '#e0e0e0') : 'transparent';

    return (
      <TouchableOpacity
        style={[styles.badge, { backgroundColor, borderColor: inactiveColor }]}
        onPress={() => setCurrentSubView(type)}
      >
        <Icon
          name={icon}
          size={14}
          color={isActive ? activeColor : inactiveColor}
          style={{ marginRight: 6 }}
        />
        <Text
          style={{
            fontSize: 12,
            color: isActive ? activeColor : inactiveColor,
            fontWeight: isActive ? 'bold' : 'normal',
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
    const activeColor = Colors[theme].text;
    const inactiveColor = theme === 'dark' ? '#888888' : '#999999';

    return (
      <TouchableOpacity
        style={[
          styles.tabItem,
          isActive && { borderBottomColor: activeColor, borderBottomWidth: 2 },
          disabled && { opacity: 0.33 },
        ]}
        disabled={disabled}
        onPress={() => setCurrentView(type)}
      >
        <Icon
          name={icon}
          size={16}
          color={isActive ? activeColor : inactiveColor}
          style={{ marginBottom: 4 }}
        />
        <Text
          style={{
            fontSize: 13,
            textAlign: 'center',
            fontWeight: isActive ? 'bold' : 'normal',
            color: isActive ? activeColor : inactiveColor,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  // 현재 페이지가 없는데 노트 모드라면 RECENT로 리셋
  useEffect(() => {
    if (!currentNote && currentView === 'CURRENT_NOTE') {
      setCurrentView('RECENT');
    }
  }, [currentNote, currentView === 'CURRENT_NOTE']);

  return (
    <View style={{ flex: 1 }}>
      <List.Item left={RenderIcon('home')} title={lang('Home')} onPress={() => push('Home')} />
      <TimeLineButton />
      <ProblemButton />
      <CurrentTabSection />
      <ScrollView style={Platform.OS === 'web' ? ({ scrollbarWidth: 'thin' } as any) : {}}>
        <TabsSection />
        <View
          style={[styles.tabContainer, { borderBottomColor: theme === 'dark' ? '#333' : '#eee' }]}
        >
          {renderTab('RECENT', lang('All Notes'), 'notebook', currentView === 'RECENT')}
          {renderTab('KANBAN', lang('Kanban'), 'view-dashboard', currentView === 'KANBAN')}
          {renderTab(
            'CURRENT_NOTE',
            currentNote ? currentNote.title : lang('Current Note'),
            'file-document',
            currentView === 'CURRENT_NOTE',
            currentNote === undefined
          )}
        </View>
        {currentView === 'CURRENT_NOTE' && currentNote && (
          <View style={styles.badgeContainer}>
            {renderBadge('TOC', lang('Table of Contents'), 'format-list-bulleted')}
            {renderBadge('SUBNOTE', lang('Sub Notes'), 'file-tree')}
            {renderBadge('HISTORY', lang('Changelog'), 'clock-outline')}
          </View>
        )}
        {currentView === 'RECENT' ? (
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
