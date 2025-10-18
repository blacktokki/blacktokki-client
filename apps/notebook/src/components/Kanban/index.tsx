import React, { useMemo, useRef, useState } from 'react';
import { FlatList, StyleProp, ViewStyle, View, ScrollView } from 'react-native';

import KanbanCard from './KanbanCard';

type Column<T> = {
  name: string;
  data: T[];
};

type KanbanProps<T> = {
  columns: Column<T>[];
  renderItem: (e: { item: T; index: number }) => JSX.Element;
  onStart: () => void;
  onEnd: (data: T, columnKey: number, nextColumnKey: number) => boolean;
  renderHeader: (e: { item: Column<T>; index: number }) => JSX.Element;
  columnStyle: StyleProp<ViewStyle>;
  horizontal?: boolean;
};

const indexResult = (columnIndex: number, move: number, positions: number[]) => {
  let i = -1;
  const currentX = positions[columnIndex] + move;
  positions.forEach((value, index) => {
    if (currentX >= value) {
      i = index;
    }
  });
  return i;
};
const cellRendererComponent = ({ children }: any) => children;

export default <T,>({
  columns,
  columnStyle,
  horizontal = false,
  renderItem,
  onStart,
  onEnd,
  renderHeader,
}: KanbanProps<T>) => {
  const positionRef = useRef<number[]>([]);
  const [currentColumn, setCurrentColumn] = useState(0);
  const [nextColumn, setNextColumn] = useState<number | undefined>(undefined);
  const _onStart = (columnIndex: number, index: number) => {
    onStart();
    setCurrentColumn(columnIndex);
  };
  const onActive = (columnIndex: number, index: number, position: { x: number; y: number }) => {
    const i = indexResult(columnIndex, horizontal ? position.y : position.x, positionRef.current);
    i !== nextColumn && setNextColumn(i);
  };

  const _onEnd = (columnIndex: number, index: number, position: { x: number; y: number }) => {
    const i = indexResult(columnIndex, horizontal ? position.y : position.x, positionRef.current);
    setNextColumn(undefined);
    if (columnIndex !== i) {
      return onEnd(columns[columnIndex].data[index], columnIndex, i);
    }
    return false;
  };
  const columnList = useMemo(() => {
    console.log('!@@');
    return columns.map((_item, itemIndex) =>
      _item.data.map((item, index) => {
        return (
          <KanbanCard
            item={item}
            renderItem={(item) => renderItem({ index, item })}
            onStart={() => _onStart(itemIndex, index)}
            onActive={(p) => onActive(itemIndex, index, p)}
            onEnd={(p) => _onEnd(itemIndex, index, p)}
          />
        );
      })
    );
  }, [columns]);
  const commonPadding = 10;
  return (
    <ScrollView
      horizontal={horizontal}
      style={{ width: '100%', height: '100%', padding: commonPadding }}
      contentContainerStyle={{ flexDirection: horizontal ? 'column' : 'row', flex: 1 }}
    >
      {columns.map((item, itemIndex) => (
        <View
          key={itemIndex}
          style={[
            {
              flex: horizontal ? undefined : 1,
              zIndex: itemIndex === currentColumn ? 5000 : undefined,
            },
            columnStyle,
            nextColumn !== undefined && itemIndex !== currentColumn
              ? {
                  borderWidth: itemIndex === nextColumn ? 2 : 1,
                  padding: (itemIndex === nextColumn ? 0 : 1) + commonPadding,
                  borderStyle: 'dashed',
                }
              : { padding: 2 + commonPadding },
          ]}
          onLayout={(e) => {
            positionRef.current[itemIndex] = horizontal
              ? e.nativeEvent.layout.y
              : e.nativeEvent.layout.x;
          }}
        >
          {renderHeader({ item, index: itemIndex })}
          <FlatList
            horizontal={horizontal}
            data={item.data}
            renderItem={({ item, index }) => columnList[itemIndex][index]}
            CellRendererComponent={cellRendererComponent}
            style={{ overflow: 'visible', backgroundColor: 'transparent' }}
          />
        </View>
      ))}
    </ScrollView>
  );
};
