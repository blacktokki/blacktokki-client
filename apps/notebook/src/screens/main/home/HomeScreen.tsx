import React, { useEffect, useState } from 'react';
import { StackScreenProps } from '@react-navigation/stack';
import { FlatList, ScrollView, StyleSheet, TextInput, TouchableOpacity, View} from 'react-native';
import { Colors, Text, useColorScheme, useLangContext } from '@blacktokki/core';
import { HomeSection, ConfigSections } from '@blacktokki/navigation';
import { TabViewOption } from '@blacktokki/navigation';
import ContentGroupSection, { AddNoteButton } from './ContentGroupSection';
import { List } from 'react-native-paper';
import { createCommonStyles } from '../../../styles';
//@ts-ignore
import Icon from 'react-native-vector-icons/FontAwesome';
import { SearchBar } from '../../../components/SearchBar';


const OpenedEditorsTabView = ()=>{
  const theme = useColorScheme()
  return <ScrollView style={{flex:1, backgroundColor:Colors[theme].background}}>
      <ContentGroupSection type={'PAGE'} />
    </ScrollView>
}

const NoteTabView = ()=>{
  const theme = useColorScheme()
  return <ScrollView style={{flex:1, backgroundColor:Colors[theme].background}}>
      <ContentGroupSection type={'NOTE'} extra={false}/>
    </ScrollView>
}

const ConfigTabView = ()=>{
  const theme = useColorScheme()
  return <ScrollView style={{flex:1, backgroundColor:Colors[theme].background}}>
    <ConfigSections/>
  </ScrollView>
}

export default function HomeScreen({navigation, route}: StackScreenProps<any, 'Home'>) {
  const { lang } = useLangContext()
  const theme = useColorScheme()
  const commonStyles = createCommonStyles(theme);
  const title = lang('Blacktokki Notebook')
  const tabViews:TabViewOption[] = [
    {title: lang('Opened Editors'), component:OpenedEditorsTabView, icon:<List.Icon icon={'file-document-edit'}/>, headerRight:()=><></>},
    {title: lang('Notes'), component:NoteTabView, icon:<List.Icon icon={'notebook'}/>, headerRight:()=><AddNoteButton/>},
    {title: lang('Config'), component:ConfigTabView, icon:<List.Icon icon={'dots-horizontal'}/>, headerRight:()=><></>}
  ]
  
  return <HomeSection tabViews={tabViews} homeView={{title, headerRight:() => <SearchBar/>}} headerTitle={title}>
    <View style={[commonStyles.container, {width:'100%'}]}>
      <View style={commonStyles.card}>
        <TouchableOpacity
          onPress={() => navigation.navigate('RecentPages')}
          style={styles.recentButton}
        >
          <Icon name="history" size={20} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
          <Text style={[commonStyles.text, { marginLeft: 8, fontWeight: 'bold' }]}>최근 변경</Text>
        </TouchableOpacity>

      </View>
      <View style={commonStyles.card}>
        <ConfigSections/>
      </View>
    </View>
  </HomeSection>
}

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    marginBottom: 0,
  },
  searchButton: {
    backgroundColor: '#3498DB',
    justifyContent: 'center',
    alignItems: 'center',
    width: 48,
    borderRadius: 4,
    marginLeft: 8,
  },
  recentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
});