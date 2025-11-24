import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleProp, ViewStyle, View, Animated } from 'react-native';

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
  const sizeRef = useRef<[number[], number[]]>([[], []]);
  const [maxSize, setMaxSize] = useState<number | undefined>(0);
  const translate = useRef(new Animated.Value(0)).current;
  const animated = useRef<Animated.CompositeAnimation>();
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

  const _onEnd = useCallback(
    (columnIndex: number, index: number, position: { x: number; y: number }) => {
      const i = indexResult(columnIndex, horizontal ? position.y : position.x, positionRef.current);
      setNextColumn(undefined);
      if (columnIndex !== i) {
        return onEnd(columns[columnIndex].data[index], columnIndex, i);
      }
      return false;
    },
    [columns, horizontal, onEnd]
  );
  const nextAnimated = () => {
    if (animated.current) {
      const now = animated.current;
      animated.current.start(() => {
        nextAnimated();
        if (animated.current === now) {
          animated.current = undefined;
        }
      });
    }
  };
  const columnList = useMemo(() => {
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
  }, [columns, horizontal, _onEnd]);
  useEffect(() => {
    setMaxSize(undefined);
    sizeRef.current = [[], []];
  }, [horizontal]);
  useEffect(() => {
    setMaxSize(undefined);
    sizeRef.current = [sizeRef.current[0], []];
  }, [columns, _onEnd]);
  const commonPadding = 5;
  return (
    <View
      //@ts-ignore
      style={{
        width: '100%',
        height: '100%',
        flexDirection: horizontal ? 'column' : 'row',
        flex: 1,
        overflow: 'auto',
        padding: 20 - commonPadding,
        paddingTop: 0,
      }}
      onScroll={(e: any) => {
        const value = horizontal
          ? e.target.scrollLeft
          : e.target.scrollTop + (e.target.scrollTop > 2 ? -2 : 0);
        const isFirst = animated.current === undefined;
        animated.current = Animated.timing(translate, {
          toValue: value,
          duration: 64,
          useNativeDriver: true,
        });
        if (isFirst) {
          nextAnimated();
        }
      }}
    >
      {columns.map((item, itemIndex) => (
        <View
          key={itemIndex}
          style={{
            zIndex: itemIndex === currentColumn ? 5000 : undefined,
            flexDirection: horizontal ? 'row' : 'column',
          }}
          onLayout={(e) => {
            positionRef.current[itemIndex] = horizontal
              ? e.nativeEvent.layout.y
              : e.nativeEvent.layout.x;
          }}
        >
          <View
            style={[
              { borderWidth: 1, borderColor: (columnStyle as ViewStyle)?.borderColor },
              nextColumn !== undefined && itemIndex !== currentColumn
                ? { borderStyle: 'dashed' }
                : { borderColor: 'transparent' },
            ]}
          >
            <View
              style={[
                {
                  flexGrow: 1,
                  borderWidth: 2,
                  paddingHorizontal: commonPadding,
                  paddingBottom: commonPadding,
                  paddingTop: 0,
                },
                columnStyle,
                itemIndex === nextColumn && itemIndex !== currentColumn
                  ? { borderStyle: 'dashed' }
                  : { borderColor: 'transparent' },
                maxSize ? (horizontal ? { width: maxSize } : { height: maxSize }) : {},
              ]}
              onLayout={(e: any) => {
                const value = horizontal
                  ? e.nativeEvent.target.clientWidth
                  : e.nativeEvent.target.clientHeight;
                sizeRef.current[sizeRef.current[0][itemIndex] === undefined ? 0 : 1][itemIndex] =
                  value;
                if (sizeRef.current[1].length === columns.length) {
                  const maxSize0 = Math.max(...sizeRef.current[0]);
                  const maxSize1 = Math.max(...sizeRef.current[1]) + 3;
                  setMaxSize(Math.max(maxSize0, maxSize1));
                }
              }}
            >
              <View style={horizontal ? { flexDirection: 'row' } : { width: '100%', zIndex: 4900 }}>
                <Animated.View
                  style={{
                    transform: [horizontal ? { translateX: translate } : { translateY: translate }],
                  }}
                >
                  {renderHeader({ item, index: itemIndex })}
                </Animated.View>
              </View>
              <FlatList
                horizontal={horizontal}
                data={item.data}
                renderItem={({ item, index }) => columnList[itemIndex][index]}
                CellRendererComponent={cellRendererComponent}
                style={{ overflow: 'visible', backgroundColor: 'transparent' }}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
};
