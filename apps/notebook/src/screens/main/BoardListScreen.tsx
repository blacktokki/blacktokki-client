import { useLangContext, Text, Spacer } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import { View, FlatList, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import MciIcon from 'react-native-vector-icons/MaterialCommunityIcons';

import { ResponsiveSearchBar } from '../../components/SearchBar';
import StatusCard from '../../components/StatusCard';
import UsageButton from '../../components/UsageButton';
import { useBoardPages, useCreateOrUpdateBoard, useDeleteBoard } from '../../hooks/useBoardStorage';
import { useNotePages } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { NavigationParamList } from '../../types';
import { getBoardStatsList, updatedFormat } from './home/ContentGroupSection';

export const BoardListScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { commonStyles } = useNotebookTheme();
  const { lang } = useLangContext();

  const { data: boards = [] } = useBoardPages();
  const { data: pages = [] } = useNotePages();
  const mutation = useCreateOrUpdateBoard();
  const deleteMutation = useDeleteBoard();

  const [searchText, setSearchText] = useState('');
  const searchBoard = boards?.find((v) => v.title === searchText);

  return (
    <>
      <ResponsiveSearchBar />
      <UsageButton paragraph={'🗂 ' + lang('Board')} />
      <View style={commonStyles.container}>
        {boards.length > 0 ? (
          <FlatList
            data={getBoardStatsList(boards, pages)}
            renderItem={({ item }) => {
              return (
                <TouchableOpacity
                  style={commonStyles.card}
                  onPress={() => navigation.push('BoardPage', { title: item.title })}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={commonStyles.title}>{item.title}</Text>
                    <Text style={commonStyles.smallText}>{updatedFormat(item.stats.updated)}</Text>
                  </View>
                  <View style={localStyles.statsContainer}>
                    <View style={localStyles.statItem}>
                      <MciIcon name="notebook" size={14} color={commonStyles.smallText.color} />
                      <Text style={[commonStyles.smallText, localStyles.statValue]}>
                        {item.stats.noteCount}
                      </Text>
                    </View>
                    <View style={[localStyles.statItem, { marginLeft: 16 }]}>
                      <MciIcon name="view-grid" size={14} color={commonStyles.smallText.color} />
                      <Text style={[commonStyles.smallText, localStyles.statValue]}>
                        {item.stats.cardCount}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => <Spacer height={8} />}
          />
        ) : (
          <StatusCard message="There are no boards." />
        )}

        {/* 하단 보드 생성/검색/삭제 바 */}
        <View style={[commonStyles.searchContainer, { paddingTop: 16 }]}>
          <TextInput
            style={commonStyles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder={lang('Add & Delete')}
            placeholderTextColor={commonStyles.placeholder.color}
          />
          {/* 보드 추가 */}
          <TouchableOpacity
            style={[
              commonStyles.searchButton,
              !searchBoard && searchText !== '' ? {} : { backgroundColor: 'gray' },
            ]}
            disabled={!(!searchBoard && searchText !== '')}
            onPress={
              !searchBoard && searchText !== ''
                ? () =>
                    mutation.mutateAsync({
                      title: searchText,
                      description: '',
                      option: {
                        BOARD_NOTE_IDS: [],
                        BOARD_HEADER_LEVEL: 3,
                      },
                    })
                : undefined
            }
          >
            <Icon name={'plus'} size={18} color="#FFFFFF" />
          </TouchableOpacity>
          {/* 보드 삭제 */}
          <TouchableOpacity
            style={[commonStyles.searchButton, searchBoard ? {} : { backgroundColor: 'gray' }]}
            disabled={!searchBoard}
            onPress={searchBoard ? () => deleteMutation.mutateAsync(searchBoard.id) : undefined}
          >
            <Icon name={'minus'} size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
};

const localStyles = StyleSheet.create({
  statsContainer: {
    flexDirection: 'row',
    marginTop: 6,
    alignItems: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statValue: {
    marginLeft: 4,
    fontWeight: '600',
  },
});
