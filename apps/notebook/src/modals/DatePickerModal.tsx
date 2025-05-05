import dayjs from 'dayjs';
import React, { Suspense, useState } from 'react';
import { TouchableOpacity } from 'react-native';

// import useModalEffect from '../hooks/useModalEffect';
import { Calendar, useLangContext, useModalsContext, View, Text, CommonButton } from '@blacktokki/core';

const getDisableDays = (date: dayjs.Dayjs) => {
  const result:string[] = [];
  // let startDate = date.clone().startOf('month').add(-1, 'month');
  // const endDate = date.clone().endOf('month').add(1, 'month');
  // const today = dayjs().startOf('day');
  // while (startDate <= endDate && startDate < today) {
  //   result.push(startDate.format('YYYY-MM-DD'));
  //   startDate = startDate.add(1, 'day');
  // }
  return result;
};

const defaultDayjs = () => {
  const m = dayjs();
  const restMinute = parseInt(m.format('mm'), 10) % 5;
  return m.add(5 - restMinute, 'minute');
};

export default function DatePickerModal({
  datetime,
  callback,
}: {
  datetime?: string;
  callback: (datetime?: string) => void;
}) {
  const _dayjs = datetime ? dayjs(datetime) : defaultDayjs();
  const { lang, locale } = useLangContext();
  const [date, setDate] = useState(_dayjs.format('YYYY-MM-DD'));
  const [disableDays, setDisableDays] = useState<string[]>(getDisableDays(_dayjs));
  const { setModal } = useModalsContext();
  const back = () => {
    setModal(DatePickerModal, null);
  };
  // useModalEffect(back, []);
  return (<View style={{flex:1, margin:0, justifyContent:'flex-end', backgroundColor:'transparent'}}>
    <View style={{alignItems:'center', minHeight:450}}>
      <View style={{ flexDirection: 'row', width: '100%' }}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <TouchableOpacity onPress={back}>
            <Text>{lang("back")}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, textAlign: 'center' }}>{lang('Date')}</Text>
        </View>
        <View style={{ flex: 1 }} />
      </View>
      <View
        style={{ marginBottom: 20, height: 1, width: '100%' }}
        lightColor="#ddd"
        darkColor="rgba(255,255,255, 0.3)"
      />
        <Suspense fallback={<></>}>
          <Calendar
            locale={locale}
            style={undefined}
            setDate={setDate}
            disableAllTouchEventsForDisabledDays={true}
            onMonthChange={(v) => setDisableDays(getDisableDays(dayjs(v.dateString)))}
            markedDates={{
              ...disableDays.reduce((p, c) => {
                p[c] = { disabled: true };
                return p;
              }, {} as Record<string, any>),
              ...(date ? [date] : []).reduce((p, c) => {
                p[c] = { selected: true };
                return p;
              }, {} as Record<string, any>),
            }}
          />
        </Suspense>
      <View style={{ flexDirection: 'row' }}>
        <CommonButton
          title={lang('save')}
          onPress={() => {
            callback?.(date);
            back();
          }}
        />
        <CommonButton
          title={lang('cancel')}
          onPress={() => {
            callback?.(undefined);
            back();
          }}
        />
      </View>
    </View>
  </View>
  );
}
