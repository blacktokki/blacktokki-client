import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, ScrollView, FlatList, FlatListProps } from 'react-native';
import { createCommonStyles } from '../../styles';
import { useColorScheme, useResizeContext, View, Text } from '@blacktokki/core';
import { StackNavigationProp } from '@react-navigation/stack';
import { Content, NavigationParamList } from '../../types';
import { useNavigation } from '@react-navigation/core';
import { Card } from 'react-native-paper';
import { useNotePages } from '../../hooks/useNoteStorage';
import { toRecentContents } from './home/ContentGroupSection';

const updatedOffset = new Date().getTimezoneOffset()

export const updatedFormat = (_updated:string) => {
  const _date = new Date(_updated)
  _date.setMinutes(_date.getMinutes() - updatedOffset)
  const updated = _date.toISOString().slice(0, 16)
    const date = updated.slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    return date==today?updated.slice(11):date;
}

function removeAttributesRecursively(element: Element) {
  const attributes = Array.from(element.attributes); // 반복 중 변경 방지용 복사

  for (const attr of attributes) {
    if (attr.name === 'href') {
      element.setAttribute('href', '');
    } else {
      element.removeAttribute(attr.name);
    }
  }

  // 자식 요소들에 대해 재귀 호출
  for (const child of element.children as unknown as Element[]) {
    removeAttributesRecursively(child);
  }
}

function removeAllAttributesFromHTML(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // body 하위 요소에 대해서만 처리
  const body = doc.body;
  for (const child of body.children as unknown as Element[]) {
    removeAttributesRecursively(child);
  }

  return body.innerHTML;
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
  const RenderHtml = React.lazy(()=> import('react-native-render-html'))

  useEffect(() => {
    if (!mounted){
      const timer = setTimeout(() => setMounted(true), 50 * index - 400);
      return () => clearTimeout(timer);
    }
  }, [item, index, mounted]);

  if (item === null){
    return <View style={{flexBasis:window==='landscape'?'33%':'50%', maxWidth:cardMaxWidth}}/>
  }
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const onPress = ()=>navigation.push('NotePage', {title:item.title})
  return <TouchableOpacity style={{flexBasis:window==='landscape'?'33%':'50%', padding:_cardPadding(window==="landscape"), paddingRight:0, minWidth:cardMaxWidth, maxWidth:cardMaxWidth}} onPress={onPress}>
      <Card onPress={onPress} style={[commonStyles.card, {paddingTop:8, aspectRatio:1/Math.sqrt(2), borderRadius:6, marginVertical:10, marginHorizontal:8, overflow:'hidden'}]}>
        <Card.Content style={{padding:0}}>
          <Suspense>
            {mounted && <RenderHtml source={{html:item.description || ''}} renderersProps={{ a : {onPress}}} tagsStyles={{body: {color:commonStyles.text.color}}} contentWidth={cardMaxWidth}/>}
        </Suspense>
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
    const contents = useMemo(()=>[...toRecentContents(recentPages).map(v=>({...v, description:removeAllAttributesFromHTML(v.description || '').slice(0, 300)})), null, null], [recentPages])
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