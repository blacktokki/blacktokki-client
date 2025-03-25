import React, {} from 'react';
import { StackScreenProps } from '@react-navigation/stack';
import { ScrollView, View} from 'react-native';
import { Colors, Text, useColorScheme, useLangContext } from '@blacktokki/core';
import { HomeSection, ConfigSections } from '@blacktokki/navigation';
import { TabViewOption } from '@blacktokki/navigation';
import ContentGroupList from '../../components/ContentGroupList';
import { List } from 'react-native-paper';

const ContentTabView = ()=>{
  const theme = useColorScheme()
  return <ScrollView style={{flex:1, backgroundColor:Colors[theme].background}}>
      <ContentGroupList type={'PAGE'} />
      <ContentGroupList type={'NOTEV2'} extra={false}/>
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
    {title: lang('Contents'), component:ContentTabView, icon:<List.Icon icon={'table-of-contents'}/>, headerRight:()=><></>},
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
