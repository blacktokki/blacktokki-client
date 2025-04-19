import React, { useEffect, useState } from 'react';
import { StackScreenProps } from '@react-navigation/stack';
import { FlatList, ScrollView, StyleSheet, TextInput, TouchableOpacity, View} from 'react-native';
import { Colors, Text, useColorScheme, useLangContext } from '@blacktokki/core';
import { HomeSection, ConfigSections } from '@blacktokki/navigation';
import { TabViewOption } from '@blacktokki/navigation';
import ContentGroupSection from './ContentGroupSection';
import { List } from 'react-native-paper';
import { createCommonStyles } from '../../../styles';
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
      <ContentGroupSection type={'NOTE'}/>
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
    {title: lang('Open Pages'), component:OpenedEditorsTabView, icon:<List.Icon icon={'file-document'}/>, headerRight:()=><></>},
    {title: lang('Notes'), component:NoteTabView, icon:<List.Icon icon={'notebook'}/>, headerRight:()=><></>},
    {title: lang('Config'), component:ConfigTabView, icon:<List.Icon icon={'dots-horizontal'}/>, headerRight:()=><></>}
  ]
  
  return <HomeSection tabViews={tabViews} homeView={{title, headerRight:() => <SearchBar/>}} headerTitle={title}>
    <View style={[commonStyles.container, {width:'100%'}]}>
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