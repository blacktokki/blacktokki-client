import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { NavigationParamList } from '../../types';
import { useNotePages, useRecentPages } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { useColorScheme, useResizeContext } from '@blacktokki/core';
import { SearchBar } from '../../components/SearchBar';

const updatedOffset = new Date().getTimezoneOffset()

const updatedFormat = (_updated:string) => {
  const _date = new Date(_updated)
  _date.setMinutes(_date.getMinutes() - updatedOffset)
  const updated = _date.toISOString().slice(0, 16)
    const date = updated.slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    return date==today?updated.slice(11):date;
}


export const RecentPagesScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const window = useResizeContext();

  const { data: recentPages = [], isLoading } = useNotePages();
  
  const handlePagePress = (title: string) => {
    navigation.navigate('NotePage', { title });
  };
  

  return (<>
    {window === 'portrait' && <SearchBar/>}
    <View style={commonStyles.container}>      
      {isLoading ? (
        <View style={[commonStyles.card, commonStyles.centerContent]}>
          <Text style={commonStyles.text}>로딩 중...</Text>
        </View>
      ) : recentPages.length > 0 ? (
        <FlatList
          data={recentPages.sort((a, b)=>new Date(b.updated).getTime() - new Date(a.updated).getTime() )}
          keyExtractor={(item) => item.title}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={commonStyles.card}
              onPress={() => handlePagePress(item.title)}
            >
              <Text style={commonStyles.title}>{item.title}</Text>
              <Text style={commonStyles.smallText}>
                최근 수정: {updatedFormat(item.updated)}
              </Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      ) : (
        <View style={[commonStyles.card, commonStyles.centerContent]}>
          <Text style={commonStyles.text}>
            최근 수정한 노트가 없습니다.
          </Text>
        </View>
      )}
    </View>
  </>);
};

const styles = StyleSheet.create({
  backButton: {
    padding: 8,
  },
});