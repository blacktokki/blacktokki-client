import React, { useState } from 'react';
import dayjs from 'dayjs';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { NavigationParamList } from '../../types';
import { useNotePages, useRecentPages } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { useColorScheme, useResizeContext } from '@blacktokki/core';
import { SearchBar } from '../../components/SearchBar';
import { parseHtmlToSections } from '../../components/HeaderSelectBar';
import DateHeaderSection, { today } from './DateHeaderSection';
import { EditorViewer } from '@blacktokki/editor';

const getMonthEnd = (year: number, month: number): string => {
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  };

  const addDays = (dateStr: string, days: number): string => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

function extractDates(input: string) {
    // 정규식 패턴들
    const patterns: { regex: RegExp, parse: (match: RegExpExecArray) => {text:string, dateStart:string, dateEnd:string, nextText:string} }[] = [
      // YYYY-MM-DD ~ YYYY-MM-DD (공백 허용)
      {
        regex: /^(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2}).*$/,
        parse: (match) => {
        const a = dayjs(match[1])
        const b = dayjs(match[2])
        const diff = b.diff(a, 'day') + 1
        return {
          text: match[0].trim(),
          dateStart: match[1],
          dateEnd: match[2],
          nextText: a.add(diff, 'day').format('YYYY-MM-DD') + "~" + b.add(diff, 'day').format('YYYY-MM-DD')
        }}
      },
      // YYYY-MM-DD
      {
        regex: /^(\d{4}-\d{2}-\d{2}).*$/,
        parse: (match) => ({
          text: match[0].trim(),
          dateStart: match[1],
          dateEnd: match[1],
          nextText: dayjs(match[1]).add(1, 'day').format('YYYY-MM-DD')
        })
      },
      // YYYY-MM
      {
        regex: /^(\d{4})-(\d{2}).*$/,
        parse: (match) => {
            const year = parseInt(match[1], 10);
            const month = parseInt(match[2], 10);
            const lastDay = new Date(year, month, 0).getDate();
            const dateStart = `${year}-${String(month).padStart(2, '0')}-01`
            return {
            text: match[0].trim(),
            dateStart,
            dateEnd: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
            nextText: dayjs(dateStart).add(1, 'month').format('YYYY-MM') 
        }}
      },
    ];
  
    for (const pattern of patterns) {
      const match = pattern.regex.exec(input);
      if (match) {
        return pattern.parse(match);
      }
    }
  }


export const TimeLineScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const _window = useResizeContext();
  const [date, setDate] = useState(today())
  const dateNum = new Date(date).getTime()

  const { data: notes = [], isLoading } = useNotePages();
  const data = notes.flatMap(v=>{
    const preData = parseHtmlToSections(v.description || '').map(section=>{
        const parentList = section.path.split(" > ");
        const parentPath = parentList.slice(0, parentList.length -1).join(" > ")
        const dateMatch = extractDates(section.title);
        if(dateMatch){
          const nextMatches:typeof dateMatch[] = []
          for (let i=0, match=dateMatch;i<3;i++){
            const _match = extractDates(match.nextText);
            if (_match){
              nextMatches.push(_match)
              match = _match;
            }
          }
          return {...v, section, parentPath, dateMatch, nextMatches}
        }
    }).filter(v2=>v2 !== undefined)
    const past = preData.filter(v2=>new Date(v2.dateMatch.dateStart).getTime() <= dateNum && dateNum <= new Date(v2.dateMatch.dateEnd).getTime()).map(v2=>({...v2, current:undefined}))
    const pastParents = new Set(past.map(v2=>v2.parentPath))
    const current = preData.map(v2=>{
      if (!pastParents.has(v2.parentPath)){
        const current = v2.nextMatches.findIndex(nextMatch=>new Date(nextMatch.dateStart).getTime() <= dateNum && dateNum <= new Date(nextMatch.dateEnd).getTime())
        if (current >=0)
          return {...v2, current}
      }
    }).filter(v=>v !== undefined);
    return [...past, ...current ]
  })

  const handlePagePress = (title: string, section: string) => {
    navigation.navigate('NotePage', { title, section });
  };
  

  return (<>
    {_window === 'portrait' && <SearchBar/>}
    <View style={commonStyles.container}>
      <DateHeaderSection date={date} setDate={setDate}/>
      {isLoading ? (
        <View style={[commonStyles.card, commonStyles.centerContent]}>
          <Text style={commonStyles.text}>로딩 중...</Text>
        </View>
      ) : data.length > 0 ? (
        <FlatList
          data={data}
          keyExtractor={(item) => item.title}
          renderItem={({ item }) => {
            const parentList = item.parentPath.split(" > ")
            const parentSection = item.parentPath.length>0 && parentList.length>0?parentList[parentList.length -1]:item.title
            const section = item.current ===undefined?item.section.title:item.nextMatches[item.current].text;
            return <>
            <View style={commonStyles.header}>
              <TouchableOpacity onPress={()=>handlePagePress(item.title, parentSection)}>
                <Text style={[commonStyles.title, styles.pageTitle]} numberOfLines={1}>
                  {item.title}
                </Text>
              </TouchableOpacity>
              
            </View>
            <View style={commonStyles.card}>
              <View style={commonStyles.header}>
                <Text style={[commonStyles.title, styles.pageTitle, item.current ===undefined?{}:{fontStyle:'italic'}]}>{parentSection}</Text>
                <Text selectable={false} style={commonStyles.smallText}>{section}</Text>
              </View>
              <EditorViewer
                active
                value={item.current ===undefined?item.section.description:''}
                theme={theme}
                onLink={(url)=>{
                  const newLocation = new URL(url);
                  if (location.origin + location.pathname === newLocation.origin + newLocation.pathname){
                    const title = (new URLSearchParams(newLocation.search)).get("title")
                    title && navigation.navigate("NotePage", {title})
                  }
                  else{
                    window.open(url, '_blank');
                  }
                }}
                autoResize
              /> 
            </View>
          </>}}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      ) : (
        <View style={[commonStyles.card, commonStyles.centerContent]}>
          <Text selectable={false} style={commonStyles.text}>
            노트가 없습니다.
          </Text>
        </View>
      )}
    </View>
  </>);
};

const styles = StyleSheet.create({
  backButton: {
    padding: 8,
  },
  pageTitle: {
    flex: 1,
    fontSize: 20,
  },
});