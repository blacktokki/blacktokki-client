import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { createCommonStyles } from '../../styles';
import { useColorScheme, useResizeContext } from '@blacktokki/core';
import { SearchBar, titleFormat } from '../../components/SearchBar';

export const NoteListSection = ({contents, isLoading, onPress, emptyMessage}:{contents:{title:string, section?:string, subtitle?:string}[], isLoading:boolean, onPress:(title:string, section?:string)=>void, emptyMessage:string}) => {
    const theme = useColorScheme();
    const commonStyles = createCommonStyles(theme);
    const window = useResizeContext();
    return (<>
        {window === 'portrait' && <SearchBar/>}
        <View style={commonStyles.container}>      
          {isLoading ? (
            <View style={[commonStyles.card, commonStyles.centerContent]}>
              <Text style={commonStyles.text}>로딩 중...</Text>
            </View>
          ) : contents.length > 0 ? (
            <FlatList
              data={contents}
              keyExtractor={(item) => item.title}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={commonStyles.card}
                  onPress={() => onPress(item.title, item.section)}
                >
                  <Text style={commonStyles.title}>{titleFormat(item)}</Text>
                  {item.subtitle!==undefined && <Text style={commonStyles.smallText}>
                    {item.subtitle}
                  </Text>}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          ) : (
            <View style={[commonStyles.card, commonStyles.centerContent]}>
              <Text style={commonStyles.text}>
                {emptyMessage}
              </Text>
            </View>
          )}
        </View>
      </>);
}