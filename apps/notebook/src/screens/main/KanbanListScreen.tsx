import { useColorScheme, useLangContext, Text, Spacer } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import { View, FlatList, TouchableOpacity, TextInput } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { ResponsiveSearchBar } from '../../components/SearchBar';
import StatusCard from '../../components/StatusCard';
import UsageButton from '../../components/UsageButton';
import { useBoardPages, useCreateOrUpdateBoard, useDeleteBoard } from '../../hooks/useBoardStorage';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

export const KanbanListScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();

  const { data: boards = [] } = useBoardPages();
  const mutation = useCreateOrUpdateBoard();
  const deleteMutation = useDeleteBoard();

  const [searchText, setSearchText] = useState('');
  const searchBoard = boards?.find((v) => v.title === searchText);

  return (
    <>
      <ResponsiveSearchBar />
      <UsageButton paragraph={'🗂 ' + lang('Kanban')} />
      <View style={commonStyles.container}>
        {boards.length > 0 ? (
          <FlatList
            data={boards}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={commonStyles.card}
                onPress={() => navigation.push('KanbanPage', { title: item.title })}
              >
                <Text style={commonStyles.title}>{item.title}</Text>
              </TouchableOpacity>
            )}
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
