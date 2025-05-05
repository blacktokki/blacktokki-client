import React from 'react';
import dayjs from 'dayjs';
import { CommonButton, useModalsContext,Text, View, useColorScheme } from '@blacktokki/core';
import { TouchableOpacity} from 'react-native';
import DatePickerModal from '../../modals/DatePickerModal';
import { createCommonStyles } from '../../styles';

type DateHeaderSectionProps = {
    date:string,
    setDate:(date:string)=>void
    monthly?:boolean
}

export const today = () => dayjs().format('YYYY-MM-DD')


export default function DateHeaderSection({date, setDate, monthly}: DateHeaderSectionProps) {
  const theme = useColorScheme()
  const commonStyles = createCommonStyles(theme);
  const { setModal } = useModalsContext()

  return (
    <View style={[commonStyles.card, {flexDirection:'row', justifyContent:'center'}]}>
      <CommonButton title='<<' onPress={()=>setDate(dayjs(date).add(-1 ,monthly?'year':'month').format('YYYY-MM-DD'))} style={{paddingVertical:8, backgroundColor:'transparent'}}/>
      <CommonButton title='<' onPress={()=>setDate(dayjs(date).add(-1 ,monthly?'month':'day').format('YYYY-MM-DD'))} style={{paddingVertical:8, backgroundColor:'transparent'}}/>
      <View style={{flexDirection:'row',backgroundColor:'transparent'}}>
        <TouchableOpacity style={[{flex:1, borderWidth:1, borderRadius:8, height:30, paddingHorizontal:10, paddingVertical:3,borderColor:'rgba(27,31,36,0.15)', minWidth:210, minHeight:37, paddingTop:0}]}
          onPress={()=>setModal(DatePickerModal, {datetime:date, callback:(datetime?:string)=>setDate(datetime || date)})}
        >
          <Text style={{textAlign:'center', fontWeight:'700', fontSize:28}}>{(monthly && date)?date.substring(0,7):date}</Text>
        </TouchableOpacity>
        {/* {date !== today() && <CommonButton title='x' onPress={()=>setDate(today())}/>} */}
      </View>
      <CommonButton title='>' onPress={()=>setDate(dayjs(date).add(1 ,monthly?'month':'day').format('YYYY-MM-DD'))} style={{paddingVertical:8, backgroundColor:'transparent'}}/>
      <CommonButton title='>>' onPress={()=>setDate(dayjs(date).add(1 ,monthly?'year':'month').format('YYYY-MM-DD'))} style={{paddingVertical:8, backgroundColor:'transparent'}}/>
    </View>
  )
}