import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData';
import React from 'react';
import 'dayjs/locale/ko';
import { Text, View, StyleProp, ViewStyle } from 'react-native';
import { default as BaseCalendar } from 'react-native-calendars/src/calendar';
import { DateData, DayState, MarkedDates, MarkingTypes } from 'react-native-calendars/src/types';
import LocaleConfig from 'xdate';

type locale_detail = typeof LocaleConfig.locales[''] & {
  today: string;
  prev: string;
  next: string;
  monthFormat?: string;
};

dayjs.extend(localeData).localeData();
dayjs.locale('en');

(LocaleConfig.locales['en'] as locale_detail) = {
  monthNames: dayjs.months(),
  monthNamesShort: dayjs.monthsShort(),
  dayNames: dayjs.weekdays(),
  dayNamesShort: dayjs.weekdaysShort(),
  today: 'Today',
  prev: 'Prev',
  next: 'Next',
  monthFormat: undefined,
};

dayjs.locale('ko');

(LocaleConfig.locales['ko'] as locale_detail) = {
  monthNames: dayjs.months(),
  monthNamesShort: dayjs.monthsShort(),
  dayNames: dayjs.weekdays(),
  dayNamesShort: dayjs.weekdaysShort(),
  today: '오늘',
  prev: '이전',
  next: '다음',
  monthFormat: 'yyyy년 MM월',
};

export type CalendarProps = {
  date?: string;
  setDate?: (date: string) => void;
  style: StyleProp<ViewStyle>;
  markingType?: MarkingTypes;
  markedDates?: MarkedDates;
  onMonthChange?: (date: DateData) => void;
  disableAllTouchEventsForDisabledDays?: boolean;
  locale?: string;
  dayComponent?: React.ComponentType<{ date: DateData; state: DayState }>;
};

export default function Calendar(props: CalendarProps) {
  const locale = props.locale !== undefined && props.locale !== 'auto' ? props.locale : 'en';
  LocaleConfig.defaultLocale = locale;
  const currentLocale = LocaleConfig.locales[locale] as locale_detail;
  return (
    <View>
      <BaseCalendar
        markingType={props.markingType}
        markedDates={props.markedDates}
        renderArrow={(direction) => (
          <Text>{direction === 'left' ? currentLocale['prev'] : currentLocale['next']}</Text>
        )}
        monthFormat={currentLocale['monthFormat']}
        initialDate={props.date}
        disableAllTouchEventsForDisabledDays={props.disableAllTouchEventsForDisabledDays}
        onMonthChange={props.onMonthChange}
        onDayPress={(date) => props.setDate?.(date.dateString)}
        current={props.date}
        style={[{ width: 400 }, props.style]}
        dayComponent={props.dayComponent as any}
      />
      {/* <Text style={styles.dateText}>선택: {props.date}</Text> */}
    </View>
  );
}
