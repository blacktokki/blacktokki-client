import React, {} from 'react';
import { StackScreenProps } from '@react-navigation/stack';
import { ScrollView, View} from 'react-native';
import { Colors, Text, useColorScheme, useLangContext } from '@blacktokki/core';
import { HomeSection, ConfigSections, navigate } from '@blacktokki/navigation';
import { TabViewOption } from '@blacktokki/navigation';
import ContentGroupSection, { AddNoteButton } from './ContentGroupSection';
import { List } from 'react-native-paper';


const OpenedEditorsTabView = ()=>{
  const theme = useColorScheme()
  return <ScrollView style={{flex:1, backgroundColor:Colors[theme].background}}>
      <ContentGroupSection type={'PAGE'} />
    </ScrollView>
}

const NoteTabView = ()=>{
  const theme = useColorScheme()
  return <ScrollView style={{flex:1, backgroundColor:Colors[theme].background}}>
      <ContentGroupSection type={'NOTEV2'} extra={false}/>
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
  const color = Colors[theme].text
  const tabViews:TabViewOption[] = [
    {title: lang('Opened Editors'), component:OpenedEditorsTabView, icon:<List.Icon icon={'file-document-edit'}/>, headerRight:()=><></>},
    {title: lang('Notes'), component:NoteTabView, icon:<List.Icon icon={'notebook'}/>, headerRight:()=><AddNoteButton/>},
    {title: lang('Config'), component:ConfigTabView, icon:<List.Icon icon={'dots-horizontal'}/>, headerRight:()=><></>}
  ]
  return <HomeSection tabViews={tabViews} title={lang('home')}>
    <View style={{flexGrow:1, width:'80%', marginTop:72}}>
      <Text style={{fontSize:32, color}}>Blacktokki Notebook</Text>
      <View style={{backgroundColor:Colors.borderColor, height:1, width:'100%'}}/>
      {/* <Text style={{fontSize:20, color:'gray'}}>Welcome! This is a messenger for teams.</Text>*/}
      <View style={{height:24}}/>
      <ConfigSections/>
    </View>
  </HomeSection>
}
