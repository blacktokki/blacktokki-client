import React, { useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, ScrollView, FlatList, FlatListProps } from 'react-native';
import { createCommonStyles } from '../../styles';
import { useColorScheme, useResizeContext, View, Text } from '@blacktokki/core';
import { StackNavigationProp } from '@react-navigation/stack';
import { Content, NavigationParamList } from '../../types';
import { useNavigation } from '@react-navigation/core';
import { Card } from 'react-native-paper';
import { useNotePages } from '../../hooks/useNoteStorage';
import { toRecentContents } from './home/ContentGroupSection';
import RenderHtml from 'react-native-render-html';

const updatedOffset = new Date().getTimezoneOffset()

export const updatedFormat = (_updated:string) => {
  const _date = new Date(_updated)
  _date.setMinutes(_date.getMinutes() - updatedOffset)
  const updated = _date.toISOString().slice(0, 16)
    const date = updated.slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    return date==today?updated.slice(11):date;
}

const _cardPadding = (isLandscape:boolean) => isLandscape?20:4
const _cardMaxWidth = (isLandscape:boolean) => isLandscape?250:190

const CardPage = React.memo(({item, index}: {item:Content|null, index:number})=>{
  const window  = useResizeContext()
  const cardMaxWidth = _cardMaxWidth(window==="landscape")
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const fSize = window==='landscape'?2:0
  const [mounted, setMounted] = useState(index < 10);
  const [mounted2, setMounted2] = useState(index < 5);

  useEffect(() => {
    if (!mounted){
      const timer = setTimeout(() => setMounted(true), 10 * index);
      return () => clearTimeout(timer);
    }
    if (!mounted2){
      const timer = setTimeout(() => setMounted2(true), 60);
      return () => clearTimeout(timer);
    }
  }, [item, index, mounted]);

  if (item === null){
    return <View style={{flexBasis:window==='landscape'?'33%':'50%', maxWidth:cardMaxWidth}}/>
  }
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const onPress = ()=>navigation.navigate('NotePage', {title:item.title})
  return <TouchableOpacity style={{flexBasis:window==='landscape'?'33%':'50%', padding:_cardPadding(window==="landscape"), paddingRight:0, minWidth:cardMaxWidth, maxWidth:cardMaxWidth}} onPress={onPress}>
      <Card onPress={onPress} style={[commonStyles.card, {paddingTop:8, aspectRatio:1/Math.sqrt(2), borderRadius:6, marginVertical:10, marginHorizontal:8, overflow:'hidden'}]}>
        <Card.Content style={{padding:0}}>
          {mounted &&<RenderHtml source={{html:(mounted2?item.description:item.description?.slice(0, 200)) || ''}} renderersProps={{ a : {onPress}}} tagsStyles={{body: {color:commonStyles.text.color}}} contentWidth={cardMaxWidth}/>}
        </Card.Content>
      </Card>
      <View style={{flexDirection:'row', marginTop:10, padding:0, justifyContent:'space-between', alignItems:'center', width:'100%'}}>
        <Text style={{fontSize:14+fSize, overflow:'hidden'}}>{item.title}</Text>
        <Text style={{fontSize:12+fSize, opacity: 0.4, textAlign:'right'}}>{updatedFormat(item.updated)}</Text>
      </View>
  </TouchableOpacity>

})

const renderItem = ({item, index}:{item:Content|null, index:number})=><CardPage key={index} index={index} item={item}/>

export const RecentPagesSection = React.memo(() => {
    const theme = useColorScheme();
    const commonStyles = createCommonStyles(theme);
    const window = useResizeContext();
    const { data: recentPages = [], isLoading } = useNotePages();
    const contents = useMemo(()=>[...toRecentContents(recentPages), null, null], [recentPages])
    const maxWidth = (_cardMaxWidth(window==="landscape") + 5)  * (window==='landscape'?5:3)
    return isLoading ? (
      <View style={[commonStyles.card, commonStyles.centerContent]}>
        <Text style={commonStyles.text}>로딩 중...</Text>
      </View>
    ) : contents.length > 2 ? (
      <ScrollView
        key={window}
        contentContainerStyle={{alignSelf:'center', backgroundColor:'transparent', flexBasis:'100%', maxWidth, flexWrap:'wrap', flexDirection:'row', paddingRight:_cardPadding(window==='landscape'), justifyContent:window==='landscape'?undefined:'center'}}>
          {contents.map((item, index)=>renderItem({item, index}))}
      </ScrollView>
    ) : (
      <View style={[commonStyles.card, commonStyles.centerContent]}>
        <Text style={commonStyles.text}>
          최근 수정한 노트가 없습니다.
        </Text>
      </View>
    );
})