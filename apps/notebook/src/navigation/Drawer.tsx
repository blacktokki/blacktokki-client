import { useLangContext, View } from '@blacktokki/core';
import { navigate, push } from '@blacktokki/navigation';
import React, { useState } from 'react';
import { Platform, ScrollView, TouchableOpacity } from 'react-native';
import { List } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useBoardPages } from '../hooks/useBoardStorage';
import ContentGroupSection, {
  ProblemButton,
  TimeLineButton,
} from '../screens/main/home/ContentGroupSection';

export default () => {
  const { lang } = useLangContext();
  const { data: boards = [] } = useBoardPages();

  const [viewType, setViewType] = useState<'RECENT' | 'KANBAN'>('RECENT');
  const [expanded, setExpanded] = useState(false);

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
        <List.Subheader style={{}} selectable={false}>
          {lang('Open Notes')}
        </List.Subheader>
        <ContentGroupSection type={'LAST'} />
        <ContentGroupSection type={'PAGE'} />

        <TouchableOpacity onPress={() => setExpanded(!expanded)}>
          <List.Subheader style={{}} selectable={false}>
            {viewType === 'RECENT' ? lang('Recent Changes') : lang('Kanban')}{' '}
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
          </List.Subheader>
        </TouchableOpacity>

        {expanded && (
          <View>
            <TouchableOpacity
              onPress={() => {
                setViewType('RECENT');
                setExpanded(false);
              }}
            >
              <List.Subheader style={{ paddingLeft: 32 }} selectable={false}>
                {lang('Recent Changes')}
              </List.Subheader>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setViewType('KANBAN');
                setExpanded(false);
              }}
            >
              <List.Subheader style={{ paddingLeft: 32 }} selectable={false}>
                {lang('Kanban')}
              </List.Subheader>
            </TouchableOpacity>
          </View>
        )}

        {viewType === 'RECENT' ? (
          <ContentGroupSection type={'NOTE'} noteCount={10} />
        ) : (
          <List.Section>
            {boards.map((board) => (
              <List.Item
                key={board.id}
                title={board.title}
                left={(props) => <List.Icon {...props} icon="view-dashboard" />}
                // 변경: id와 title을 함께 전달
                onPress={() => navigate('KanbanPage', { title: board.title })}
              />
            ))}
            <List.Item
              left={(_props) => <List.Icon {..._props} icon={'view-dashboard-variant'} />}
              title={lang('more...')}
              onPress={() => push('KanbanList')}
            />
          </List.Section>
        )}
      </ScrollView>
    </View>
  );
};
