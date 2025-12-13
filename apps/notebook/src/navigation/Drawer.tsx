import { useLangContext, View, useColorScheme, Colors } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { List, TouchableRipple } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useCurrentPage, useLastTab } from '../hooks/useTabStorage';
import ContentGroupSection, {
  ProblemButton,
  TimeLineButton,
  ContentGroupType,
  TabsSection,
} from '../screens/main/home/ContentGroupSection';

export default () => {
  const { lang } = useLangContext();
  const theme = useColorScheme();
  const { data: lastTab } = useLastTab();
  const currentPage = useCurrentPage(lastTab);
  const [currentView, setCurrentView] = useState<ContentGroupType>('RECENT');
  const [expanded, setExpanded] = useState(false);
  const isNoteMode = ['SUBNOTE', 'TOC', 'HISTORY'].includes(currentView);

  const getCurrentViewLabel = () => {
    if (isNoteMode && currentPage) {
      return currentPage.title;
    }
    switch (currentView) {
      case 'RECENT':
        return lang('Recent Changes');
      case 'KANBAN':
        return lang('Kanban');
      default:
        return undefined;
    }
  };

  const renderOption = (type: ContentGroupType, icon: string, label: string) => (
    <TouchableRipple
      onPress={() => {
        setCurrentView(type);
        setExpanded(false);
      }}
    >
      <List.Subheader style={{ paddingLeft: 32 }} selectable={false}>
        <Icon name={icon} size={14} style={{ marginRight: 8 }} /> {label}
      </List.Subheader>
    </TouchableRipple>
  );

  const renderBadge = (type: ContentGroupType, label: string, icon: string) => {
    const isActive = currentView === type;
    const activeColor = Colors[theme].text;
    const inactiveColor = theme === 'dark' ? '#888888' : '#666666';
    const backgroundColor = isActive ? (theme === 'dark' ? '#333333' : '#e0e0e0') : 'transparent';

    return (
      <TouchableOpacity
        style={[styles.badge, { backgroundColor, borderColor: inactiveColor }]}
        onPress={() => setCurrentView(type)}
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

  useEffect(() => {
    if (getCurrentViewLabel() === undefined) {
      setCurrentView('RECENT');
    }
  }, [isNoteMode, currentPage, currentView]);

  return (
    <View style={{ flex: 1 }}>
      <List.Item
        left={(_props) => <List.Icon {..._props} icon={'home'} />}
        title={lang('Home')}
        onPress={() => push('Home')}
      />
      <TimeLineButton />
      <ProblemButton />
      <ScrollView style={Platform.OS === 'web' ? ({ scrollbarWidth: 'thin' } as any) : {}}>
        <TabsSection />

        {/* Selector Header */}
        <TouchableRipple onPress={() => setExpanded(!expanded)}>
          <List.Subheader style={{}} selectable={false}>
            {getCurrentViewLabel()}{' '}
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
          </List.Subheader>
        </TouchableRipple>

        {/* Dropdown Options */}
        {expanded && (
          <View style={{ backgroundColor: theme === 'dark' ? '#333333' : '#f0f0f0' }}>
            {currentPage && (
              <>
                {renderOption('TOC', 'file-document', currentPage.title)}
                <View
                  style={{
                    height: 1,
                    backgroundColor: '#888888',
                    marginHorizontal: 16,
                    marginVertical: 4,
                    opacity: 0.3,
                  }}
                />
              </>
            )}
            {renderOption('RECENT', 'notebook', lang('Recent Changes'))}
            {renderOption('KANBAN', 'view-dashboard', lang('Kanban'))}
          </View>
        )}

        {/* Note View Mode Badges */}
        {isNoteMode && currentPage && (
          <View style={styles.badgeContainer}>
            {renderBadge('TOC', lang('Table of Contents'), 'format-list-bulleted')}
            {renderBadge('SUBNOTE', lang('Sub Notes'), 'file-tree')}
            {renderBadge('HISTORY', lang('Changelog'), 'clock-outline')}
          </View>
        )}
        {currentView === 'RECENT' ? (
          <ContentGroupSection type={'RECENT'} noteCount={10} />
        ) : (
          <ContentGroupSection type={currentView} />
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    flexDirection: 'row',
    paddingLeft: 13,
    paddingTop: 16,
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
