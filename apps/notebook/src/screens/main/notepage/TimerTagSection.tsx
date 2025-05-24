import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { NodeData } from '../../../components/HeaderSelectBar';
import TimerTag, {
  matchDateRange,
  sectionsToDatePatterns,
  TimerData,
  today,
} from '../../../components/TimerTag';
import { useCreateOrUpdatePage } from '../../../hooks/useNoteStorage';

const replaceDay = (data: TimerData, newDate: string) => {
  return (
    data.original.substring(0, data.index) +
    newDate +
    data.original.substring(data.index + data.text.length)
  );
};

const addDay = (data: TimerData, value: number, unit: 'day' | 'month', moved: boolean) => {
  const s = moved ? dayjs(data.dateStart).add(value, unit).format(data.pattern) : data.dateStart;
  const e = dayjs(data.dateEnd).add(value, unit).format(data.pattern);
  return replaceDay(data, data.format ? data.format(s, e) : e);
};

const buttons = (data: TimerData) => {
  const format = data.format;
  return [
    ...(data.pattern.includes('DD')
      ? [
          { title: '+1d', onPress: () => data.replace(addDay(data, 1, 'day', true)) },
          { title: '+2d', onPress: () => data.replace(addDay(data, 2, 'day', true)) },
          { title: '+7d', onPress: () => data.replace(addDay(data, 7, 'day', true)) },
        ]
      : []),
    { title: '+1M', onPress: () => data.replace(addDay(data, 1, 'month', true)) },
    ...(format
      ? [
          {
            title: '+Period',
            onPress: () => {
              const s = dayjs(data.dateStart);
              const e = dayjs(data.dateEnd);
              const diff = e.diff(s, 'day');
              data.replace(
                replaceDay(
                  data,
                  format(
                    s.add(diff + 1, 'day').format(data.pattern),
                    e.add(diff + 1, 'day').format(data.pattern)
                  )
                )
              );
            },
          },
          { title: '+0d/+1d', onPress: () => data.replace(addDay(data, 1, 'day', false)) },
          { title: '+0d/+2d', onPress: () => data.replace(addDay(data, 2, 'day', false)) },
          { title: '+0d/+7d', onPress: () => data.replace(addDay(data, 7, 'day', false)) },
          { title: '+0d/+1M', onPress: () => data.replace(addDay(data, 1, 'month', false)) },
        ]
      : []),
    { title: 'Delete', onPress: () => data.replace(replaceDay(data, '')) },
  ];
};

export default (props: { title: string; paragraph: NodeData[] }) => {
  const dateNum = new Date(today()).getTime();
  const createOrUpdatePage = useCreateOrUpdatePage();
  const data = sectionsToDatePatterns(props.title, props.paragraph)
    .flatMap((v) => matchDateRange(v.dateMatches, dateNum))
    .flatMap((v) =>
      v.matches.map((v2) => ({
        ...v2,
        original: v.original,
        replace: (a: string) =>
          createOrUpdatePage.mutate({
            title: props.title,
            description: props.paragraph
              .map(
                (v3) =>
                  (v3.path === v.path && v.isHeader
                    ? v3.header.replace(v.original, a)
                    : v3.header) +
                  (v3.path === v.path && !v.isHeader
                    ? v3.description.replace(v.original, a)
                    : v3.description)
              )
              .join(''),
          }),
      }))
    );

  const [now, setNow] = useState(dayjs());
  const [expand, setExpand] = useState<number>();
  useEffect(() => {
    const timeout = setTimeout(() => {
      setNow(dayjs());
    }, 30000);
    return () => clearTimeout(timeout);
  }, [now]);
  return (
    <View style={{ height: 0 }}>
      <View style={{ flexDirection: 'row', overflow: 'hidden' }}>
        {data.map((v, i) => (
          <TimerTag
            key={i}
            data={v}
            buttons={buttons}
            now={now}
            isExpand={i === expand}
            toggleExpand={() => setExpand(expand === i ? undefined : i)}
          />
        ))}
      </View>
    </View>
  );
};
