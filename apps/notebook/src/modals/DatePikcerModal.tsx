import {
  Calendar,
  useLangContext,
  useModalsContext,
  View,
  Text,
  CommonButton,
} from '@blacktokki/core';
import { CalendarProps } from '@blacktokki/core/build/typescript/components/Calendar';
import dayjs from 'dayjs';
import React, { Suspense, useState } from 'react';
import { TouchableOpacity } from 'react-native';

export type MarkedDateRange = { dateStart: string; dateEnd: string };

const DIRECT_PICK = true;

const getMarkedDays = (dateString: string, markedDateStrings: MarkedDateRange[]) => {
  const disableDays: string[] = [];
  const date = dayjs(dateString);
  let startDate = date.clone().startOf('month').add(-1, 'month');
  const endDate = date.clone().endOf('month').add(1, 'month');
  const markedDate = markedDateStrings.map((v) => ({
    startDate: dayjs(v.dateStart),
    endDate: dayjs(v.dateEnd),
  }));
  const markedDays: string[] = [];
  // const today = dayjs().startOf('day');
  while (startDate <= endDate) {
    // if (startDate < today) {
    //   disableDays.push(startDate.format('YYYY-MM-DD'));
    // }
    if (markedDate.find((v) => !v.startDate.isAfter(startDate) && !v.endDate.isBefore(startDate))) {
      markedDays.push(startDate.format('YYYY-MM-DD'));
    }
    startDate = startDate.add(1, 'day');
  }
  return {
    ...disableDays.reduce((p, c) => {
      p[c] = { disabled: true };
      return p;
    }, {} as Record<string, any>),
    ...markedDays.reduce((p, c) => {
      p[c] = { marked: true, dotColor: 'red' };
      return p;
    }, {} as Record<string, any>),
    ...(dateString ? [dateString] : []).reduce((p, c) => {
      p[c] = { selected: true };
      return p;
    }, {} as Record<string, any>),
  };
};

const defaultDayjs = () => {
  const m = dayjs();
  const restMinute = parseInt(m.format('mm'), 10) % 5;
  return m.add(5 - restMinute, 'minute');
};

export default function DatePickerModal({
  datetime,
  markedDateStrings,
  callback,
}: {
  datetime?: string;
  markedDateStrings?: MarkedDateRange[];
  callback: (datetime?: string) => void;
}) {
  const _dayjs = datetime ? dayjs(datetime) : defaultDayjs();
  const { lang, locale } = useLangContext();
  const [date, setDate] = useState(_dayjs.format('YYYY-MM-DD'));
  const [markedDates, setMarkedDates] = useState<CalendarProps['markedDates']>(
    getMarkedDays(_dayjs.format('YYYY-MM-DD'), markedDateStrings || [])
  );
  const { setModal } = useModalsContext();
  const back = () => {
    setModal(DatePickerModal, null);
  };
  const onSave = (datetime?: string) => {
    callback?.(datetime);
    back();
  };
  return (
    <View
      style={{ flex: 1, margin: 0, justifyContent: 'flex-end', backgroundColor: 'transparent' }}
    >
      <View style={{ alignItems: 'center', minHeight: 450 }}>
        <View style={{ flexDirection: 'row', width: '100%' }}>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <TouchableOpacity onPress={back}>
              <Text>{lang('back')}</Text>
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
            date={date}
            setDate={DIRECT_PICK ? onSave : setDate}
            disableAllTouchEventsForDisabledDays={true}
            onMonthChange={(v) =>
              setMarkedDates(getMarkedDays(v.dateString, markedDateStrings || []))
            }
            markedDates={markedDates}
          />
        </Suspense>
        {!DIRECT_PICK && (
          <View style={{ flexDirection: 'row' }}>
            <CommonButton title={lang('save')} onPress={() => onSave(date)} />
            <CommonButton title={lang('cancel')} onPress={() => onSave(undefined)} />
          </View>
        )}
      </View>
    </View>
  );
}
