import { useColorScheme, useLangContext, useResizeContext, Text } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import { View, FlatList, TouchableOpacity, TextInput } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { SearchBar } from '../../components/SearchBar';
import UsageButton from '../../components/UsageButton';
import { useBoardPages, useCreateOrUpdateBoard, useDeleteBoard } from '../../hooks/useBoardStorage';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

export const KanbanListScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();
  const _window = useResizeContext();

  const { data: boards = [] } = useBoardPages();
  const mutation = useCreateOrUpdateBoard();
  const deleteMutation = useDeleteBoard();

  const [searchText, setSearchText] = useState('');
  const searchBoard = boards?.find((v) => v.title === searchText);
  const option = searchBoard?.option;

  return (
    <>
      {_window === 'portrait' && <SearchBar />}
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
                <Text style={[commonStyles.title, { fontSize: 20, fontWeight: '600' }]}>
                  {item.title}
                </Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        ) : (
          <View style={[commonStyles.card, commonStyles.centerContent]}>
            <Text selectable={false} style={commonStyles.text}>
              {lang('There are no boards.')}
            </Text>
          </View>
        )}

        {/* 하단 보드 생성/검색/삭제 바 */}
        <View style={[commonStyles.searchContainer, { paddingTop: 16 }]}>
          <TextInput
            style={commonStyles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder={lang('Add & Rename & Delete')}
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
          {/* 보드 이름 변경 (선택 기능 삭제됨, 직접 이름 입력 후 수정은 ItemScreen에서 처리하거나 여기서 이름만 매칭되면 수정 가능하게 유지) */}
          <TouchableOpacity
            style={[
              commonStyles.searchButton,
              searchText !== '' ? {} : { backgroundColor: 'gray' },
            ]}
            disabled={searchText === ''}
            onPress={
              // 이름 기반 검색 후 수정 로직 유지
              searchText !== '' && searchBoard
                ? () =>
                    option?.BOARD_NOTE_IDS &&
                    mutation.mutateAsync({
                      ...searchBoard,
                      option,
                      title: searchText,
                      description: '',
                    })
                : undefined
            }
          >
            <Icon name={'pencil'} size={18} color="#FFFFFF" />
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
