import { useAuthContext } from '@blacktokki/account';
import { useLangContext, View, useColorScheme } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { List } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useLastTab } from '../hooks/useTabStorage';
import ContentGroupSection, {
  ProblemButton,
  TimeLineButton,
  ContentGroupType,
  TabsSection,
  RenderIcon,
  ContentGroupSubType,
  CurrentTabSection,
} from '../screens/main/home/ContentGroupSection';
import { createCommonStyles } from '../styles';

export default () => {
  const { lang } = useLangContext();
  const { auth } = useAuthContext();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { data: lastTab } = useLastTab();
  const [currentView, setCurrentView] = useState<ContentGroupType>('RECENT');
  const [currentSubView, setCurrentSubView] = useState<ContentGroupSubType>('TOC');
  const currentNote = lastTab?.type === 'NOTE' ? lastTab : undefined;

  const renderBadge = (type: ContentGroupSubType, label: string, icon: string) => {
    const isActive = currentSubView === type;
    const tabStyles = commonStyles[isActive ? 'activeTab' : 'inactiveTab'];
    const borderColor = commonStyles.inactiveTab.color;
    return (
      <TouchableOpacity
        style={[styles.badge, { backgroundColor: tabStyles.backgroundColor, borderColor }]}
        onPress={() => setCurrentSubView(type)}
      >
        <Icon name={icon} size={14} color={tabStyles.color} style={{ marginRight: 6 }} />
        <Text
          style={{
            fontSize: 12,
            color: tabStyles.color,
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
    const tabStyles = commonStyles[isActive ? 'activeTab' : 'inactiveTab'];
    const borderBottomColor = commonStyles.activeTab.color;

    return (
      <TouchableOpacity
        style={[
          styles.tabItem,
          isActive && { borderBottomColor, borderBottomWidth: 2 },
          disabled && { opacity: 0.33 },
        ]}
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
    <View style={{ flex: 1 }}>
      <List.Item left={RenderIcon('home')} title={lang('Home')} onPress={() => push('Home')} />
      <TimeLineButton />
      <ProblemButton />
      <CurrentTabSection />
      <ScrollView style={Platform.OS === 'web' ? ({ scrollbarWidth: 'thin' } as any) : {}}>
        <TabsSection />
        <View
          style={[
            styles.tabContainer,
            { borderBottomColor: commonStyles.separator.backgroundColor },
          ]}
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
            {!auth.isLocal && renderBadge('HISTORY', lang('Changelog'), 'clock-outline')}
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
