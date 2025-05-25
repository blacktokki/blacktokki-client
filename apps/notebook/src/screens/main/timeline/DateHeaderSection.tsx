import { useColorScheme, useModalsContext, Text } from '@blacktokki/core';
import dayjs from 'dayjs';
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { today } from '../../../components/TimerTag';
import DatePickerModal, { MarkedDateRange } from '../../../modals/DatePikcerModal';
import { createCommonStyles } from '../../../styles';

type DateHeaderSectionProps = {
  date: string;
  setDate: (date: string) => void;
  markedDateRange: MarkedDateRange[];
  monthly?: boolean;
};

export default function DateHeaderSection({
  date,
  setDate,
  monthly,
  markedDateRange,
}: DateHeaderSectionProps) {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { setModal } = useModalsContext();
  const moveDate = (value: number) =>
    setDate(
      dayjs(date)
        .add(value, monthly ? 'month' : 'day')
        .format('YYYY-MM-DD')
    );

  const themedStyles = StyleSheet.create({
    container: {
      backgroundColor: commonStyles.container.backgroundColor,
      shadowColor: commonStyles.text.color,
      borderColor: commonStyles.card.borderColor,
    },
    dateDisplay: {
      color: commonStyles.text.color,
    },
    todayButton: {
      backgroundColor: commonStyles.searchButton.backgroundColor,
    },
    navButton: {
      backgroundColor: theme === 'dark' ? '#333333' : '#efefef',
    },
  });
  return (
    <View style={[headerStyles.container, themedStyles.container]}>
      <View style={commonStyles.flex} />
      {/* Date Display */}
      <View style={headerStyles.dateContainer}>
        <TouchableOpacity
          onPress={() =>
            setModal(DatePickerModal, {
              datetime: date,
              markedDateStrings: markedDateRange,
              callback: (datetime?: string) => setDate(datetime || date),
            })
          }
        >
          <Text style={[headerStyles.dateDisplay, themedStyles.dateDisplay]}>{date}</Text>
        </TouchableOpacity>
      </View>
      {/* Navigation Bar */}
      <View style={headerStyles.navContainer}>
        {/* Previous Day Button */}
        <TouchableOpacity
          onPress={() => moveDate(-1)}
          style={[headerStyles.navButton, themedStyles.navButton]}
        >
          <Icon name="chevron-left" size={16} color={commonStyles.text.color} />
        </TouchableOpacity>

        {/* Today Button */}
        <TouchableOpacity
          onPress={() => setDate(today())}
          style={[headerStyles.todayButton, themedStyles.todayButton]}
          accessibilityLabel="Go to today"
        >
          <Text style={headerStyles.todayButtonText}>Today</Text>
        </TouchableOpacity>

        {/* Next Day Button */}
        <TouchableOpacity
          onPress={() => moveDate(1)}
          style={[headerStyles.navButton, themedStyles.navButton]}
        >
          <Icon name="chevron-right" size={16} color={commonStyles.text.color} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const BUTTON_SIZE = 30;

// Base styles that don't change based on theme
const headerStyles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
  },
  dateContainer: {
    flex: 1,
    minWidth: 130,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDisplay: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  navContainer: {
    flex: 1,
    minWidth: 150,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  navButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
    borderRadius: 8,
    padding: 8,
  },
  todayButton: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  todayButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
