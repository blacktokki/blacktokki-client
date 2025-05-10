import React from 'react';
import { StackScreenProps } from '@react-navigation/stack';
import { ScrollView, View} from 'react-native';
import { Colors, useColorScheme, useLangContext } from '@blacktokki/core';
import { HomeSection, ConfigSections } from '@blacktokki/navigation';
import { TabViewOption } from '@blacktokki/navigation';
import ContentGroupSection, { EmptyContentButton, EmptyPageButton } from './ContentGroupSection';
import { List } from 'react-native-paper';
import { createCommonStyles } from '../../../styles';
import { SearchBar } from '../../../components/SearchBar';
import { ArchiveButtonSection } from './ConfigButtonSection';


const OpenedEditorsTabView = ()=>{
  const theme = useColorScheme()
  return <ScrollView style={{flex:1, backgroundColor:Colors[theme].background}}>
      <ContentGroupSection type={'LAST'} />
      <ContentGroupSection type={'PAGE'} />
    </ScrollView>
}

const NoteTabView = ()=>{
  const theme = useColorScheme()
  return <ScrollView style={{flex:1, backgroundColor:Colors[theme].background}}>
      <ContentGroupSection type={'NOTE'} noteCount={15}/>
      <EmptyPageButton/>
      <EmptyContentButton/>
    </ScrollView>
}

const ConfigCommonView = () => {
  const theme = useColorScheme()
  const commonStyles = createCommonStyles(theme);
  return <>
    <View style={commonStyles.card}>
      <ConfigSections/>
    </View>
    <View style={commonStyles.card}>
      <ArchiveButtonSection/>
    </View>
  </>
}

const ConfigTabView = ()=>{
  const theme = useColorScheme()
  const commonStyles = createCommonStyles(theme);
  return <ScrollView style={{flex:1}} contentContainerStyle={[commonStyles.container, {backgroundColor:Colors[theme].background}]}>
    <ConfigCommonView/>
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
      <ConfigCommonView/>
    </View>
  </HomeSection>
}
