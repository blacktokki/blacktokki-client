import React, {} from 'react';
import { StackScreenProps } from '@react-navigation/stack';
import { View} from 'react-native';
import { Colors, Text, useColorScheme, useLangContext } from '@blacktokki/core';
import HomeSection, { TabViewOption } from '@blacktokki/navigation/build/typescript/screens/main/HomeScreen/HomeSection';
import { ConfigSections } from '@blacktokki/navigation/build/typescript/screens';

const ContentTabView = ()=>{
  return <></>;
}

export default function HomeScreen({navigation, route}: StackScreenProps<any, 'Home'>) {
  const { lang } = useLangContext()
  const theme = useColorScheme()
  const color = Colors[theme].text
  const tabViews:TabViewOption[] = [
    {title: lang('contents'), component:ContentTabView, icon:<></>, headerRight:()=><></>}
  ]
  return <HomeSection tabViews={tabViews} title={lang('home')}>
    <View style={{flexGrow:1, width:'80%', marginTop:72}}>
      <Text style={{fontSize:32, color}}>Spreadocs</Text>
      <View style={{backgroundColor:Colors.borderColor, height:1, width:'100%'}}/>
      {/* <Text style={{fontSize:20, color:'gray'}}>Welcome! This is a messenger for teams.</Text>*/}
      <View style={{height:24}}/>
      <ConfigSections/>
    </View>
  </HomeSection>
}
