import React, { useState } from 'react';
import { StackNavigationProp, StackScreenProps } from '@react-navigation/stack';
import { ScrollView, TouchableOpacity, View} from 'react-native';
import { Colors, ContractFooter, Text, TextButton, useColorScheme, useLangContext } from '@blacktokki/core';
import { HomeSection, ConfigSections, navigate } from '@blacktokki/navigation';
import { TabViewOption } from '@blacktokki/navigation';
import ContentGroupSection, { EmptyContentButton, EmptyPageButton } from './ContentGroupSection';
import { List } from 'react-native-paper';
import { createCommonStyles } from '../../../styles';
import { SearchBar, SearchList } from '../../../components/SearchBar';
import { RecentPagesSection } from '../RecentPageSection';
import { useKeywords, useResetKeyowrd } from '../../../hooks/useKeywordStorage';
import { useAuthContext } from '@blacktokki/account';
import AntDesign from 'react-native-vector-icons/AntDesign';
import { NavigationParamList } from '../../../types';
import { useNavigation } from '@react-navigation/core';


const NotesTabView = ()=>{
  const theme = useColorScheme()
  const { lang } = useLangContext()
  return <ScrollView style={{flex:1, backgroundColor:Colors[theme].background}}>
      <List.Subheader style={{}} selectable={false}>{lang("Open Pages")}</List.Subheader>
      <ContentGroupSection type={'LAST'} />
      <ContentGroupSection type={'PAGE'} />
      <List.Subheader style={{}} selectable={false}>{lang("Problems")}</List.Subheader>
      <EmptyPageButton/>
      <EmptyContentButton/>
    </ScrollView>
}

const RecentChangesTabView = ()=>{
  return <RecentPagesSection/>
}

const CommonConfigButton = (props:{title:string, onPress?:()=>void})=>{
  const theme = useColorScheme()
  const commonStyles = createCommonStyles(theme);
  const color = Colors[theme].text;
  return <TouchableOpacity style={[commonStyles.header, {marginBottom:0}]} onPress={props.onPress} disabled={!props.onPress}>
    <Text style={{ fontSize: 20, color, fontWeight: '600' }}>{props.title}</Text>
    {props.onPress && <Text>{">"}</Text>}
  </TouchableOpacity>
}

const ConfigCommonView = () => {
  const { lang } = useLangContext()
  const { dispatch } = useAuthContext()
  const theme = useColorScheme()
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const commonStyles = createCommonStyles(theme);
  const color = Colors[theme].text;
  const [search, setSearch] = useState(false)
  const { data:keywords = []} = useKeywords()
  const resetKeyword = useResetKeyowrd()
  return <View>
    <View style={commonStyles.card}>
      <ConfigSections/>
    </View>
    <View style={commonStyles.card}>
      <CommonConfigButton title={lang('* Search Settings')}/>
      <View style={{flexDirection:'row'}}>
        <TextButton
          title={"Search History"}
          textStyle={{
            fontSize: 16,
            color,
            textDecorationLine: search ? 'underline' : 'none',
          }}
          style={{ borderRadius: 20 }}
          onPress={() => setSearch(!search)}
        />
        {search && keywords.length &&<TextButton
          title={"Clear"}
          textStyle={{
            fontSize: 16,
            color,
          }}
          style={{ borderRadius: 20 }}
          onPress={() => resetKeyword.mutate()}
        />}
      </View>
      {search && <View style={[commonStyles.card, {padding:0}]}>
        <SearchList filteredPages={keywords} handlePagePress={(title, section)=>navigation.push('NotePage', { title, section })}/>
      </View>}
    </View>
    <View style={commonStyles.card}>
      <CommonConfigButton title={lang('* Archive')} onPress={()=>navigation.push('Archive', {})}/>
    </View>
    <View style={commonStyles.card}>
      <CommonConfigButton title={lang('* Logout')} onPress={()=>dispatch({type:"LOGOUT_REQUEST"})}/>
    </View>
  </View>
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
    {title: lang('Discovery'), component:NotesTabView, icon:<List.Icon icon={'compass'}/>, headerRight:()=><></>},
    {title: lang('All Notes'), component:RecentChangesTabView, icon:<List.Icon icon={'notebook'}/>, headerRight:()=><></>},
    {title: lang('Config'), component:ConfigTabView, icon:<List.Icon icon={'dots-horizontal'}/>, headerRight:()=><></>}
  ]
  
  return <HomeSection tabViews={tabViews} homeView={{title, headerRight:() => <SearchBar/>}} headerTitle={title}>
    <View style={[commonStyles.container, {width:'100%', justifyContent:'space-between'}]}>
      <ConfigCommonView/>
      <ContractFooter buttons={[
        {icon:<AntDesign name="github" size={24} color={Colors[theme].iconColor}/>, url:'https://github.com/blacktokki/blacktokki-notebook', isWeb:true},
        {icon:<AntDesign name="mail" size={24} color={Colors[theme].iconColor}/>, url:'mailto:ydh051541@naver.com', isWeb:false}
      ]}/>
    </View>
  </HomeSection>
}
