import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleProp, ViewStyle, View, Animated, Text } from 'react-native';

import BoardCard from './BoardCard';

type Row<T> = {
  name: string;
  columns: {
    name: string;
    items: T[];
  }[];
};

type BoardProps<T> = {
  rows: Row<T>[];
  renderItem: (e: { item: T; index: number }) => JSX.Element;
  onStart: () => void;
  onEnd: (
    rowKey: number,
    nextRowkey: number,
    columnKey: number,
    nextColumnKey: number,
    key: number
  ) => boolean;
  renderHeader: (e: { item: { name: string }; index: number }) => JSX.Element;
  columnStyle: StyleProp<ViewStyle>;
  useScrum?: boolean;
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
  rows,
  columnStyle,
  horizontal = false,
  renderItem,
  onStart,
  onEnd,
  renderHeader,
}: BoardProps<T>) => {
  const positionRef = useRef<{ row: number[]; column: number[] }>({ row: [], column: [] });
  const [maxSize, setMaxSize] = useState({ width: 0, height: 0 });
  const translate = useRef(new Animated.Value(0)).current;
  const animated = useRef<Animated.CompositeAnimation>();
  const [currentRow, setCurrentRow] = useState<number | undefined>(undefined);
  const [currentColumn, setCurrentColumn] = useState<number | undefined>(undefined);
  const [nextRow, setNextRow] = useState<number | undefined>(undefined);
  const [nextColumn, setNextColumn] = useState<number | undefined>(undefined);

  const _onStart = (rowIndex: number, columnIndex: number) => {
    onStart();
    setCurrentColumn(columnIndex);
    setCurrentRow(rowIndex);
  };
  const onActive = (rowIndex: number, columnIndex: number, position: { x: number; y: number }) => {
    const j = indexResult(rowIndex, horizontal ? position.x : position.y, positionRef.current.row);
    const i = indexResult(
      columnIndex,
      horizontal ? position.y : position.x,
      positionRef.current.column
    );
    j >= 0 && j !== nextRow && setNextRow(j);
    i >= 0 && i !== nextColumn && setNextColumn(i);
  };

  const _onEnd = useCallback(
    (rowIndex: number, columnIndex: number, index: number, position: { x: number; y: number }) => {
      const i = indexResult(
        columnIndex,
        horizontal ? position.y : position.x,
        positionRef.current.column
      );
      const j = indexResult(
        rowIndex,
        horizontal ? position.x : position.y,
        positionRef.current.row
      );
      setNextColumn(undefined);
      setNextRow(undefined);
      setCurrentColumn(undefined);
      setCurrentRow(undefined);
      if ((i >= 0 && columnIndex !== i) || (j >= 0 && rowIndex !== j)) {
        return onEnd(rowIndex, Math.max(j, 0), columnIndex, Math.max(i, 0), index);
      }
      return false;
    },
    [rows, horizontal, onEnd]
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
  const rowList = useMemo(() => {
    return rows.map((row, rowIndex) =>
      row.columns.map((column, columnIndex) =>
        column.items.map((item, index) => {
          return (
            <BoardCard
              item={item}
              renderItem={(item) => renderItem({ index, item })}
              onStart={() => _onStart(rowIndex, columnIndex)}
              onActive={(p) => onActive(rowIndex, columnIndex, p)}
              onEnd={(p) => _onEnd(rowIndex, columnIndex, index, p)}
            />
          );
        })
      )
    );
  }, [rows, horizontal, _onEnd]);
  useEffect(() => {
    setMaxSize({ width: 0, height: 0 });
  }, [horizontal]);
  useEffect(() => {
    return () => {
      positionRef.current = { row: [], column: [] };
    };
  }, [rows]);
  const commonPadding = 5;
  return (
    <View
      //@ts-ignore
      style={{
        width: '100%',
        height: '100%',
        flexDirection: horizontal ? 'row' : 'column',
        flex: 1,
        overflow: 'auto',
        padding: 20 - commonPadding,
        paddingTop: 0,
      }}
      onScroll={(e: any) => {
        const value = horizontal
          ? e.target.scrollLeft
          : e.target.scrollTop + (e.target.scrollTop > 3 ? -3 : 0);
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
      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={{
            zIndex: rowIndex === currentRow ? 5000 : rowIndex === 0 ? 1 : undefined,
            flexDirection: horizontal ? 'row' : 'column',
          }}
          onLayout={(e) => {
            const { x, y } = e.nativeEvent.layout;
            positionRef.current.row[rowIndex] = horizontal ? x : y;
          }}
        >
          <View
            style={[
              {
                zIndex: rowIndex === 0 ? 1 : undefined,
                flexDirection: horizontal ? 'column' : 'row',
                alignSelf: 'flex-start',
              },
              //
            ]}
          >
            {row.columns.map((column, columnIndex) => (
              <View
                key={columnIndex}
                style={[
                  {
                    zIndex: columnIndex === currentColumn ? 5000 : undefined,
                    flex: 1,
                    borderWidth: 1,
                    borderColor: (columnStyle as ViewStyle)?.borderColor,
                  },
                  horizontal ? { minHeight: maxSize.height } : { minWidth: maxSize.width },
                  nextColumn !== undefined &&
                  nextRow !== undefined &&
                  (columnIndex !== currentColumn || rowIndex !== currentRow)
                    ? { borderStyle: 'dashed' }
                    : { borderColor: 'transparent' },
                ]}
                onLayout={(e) => {
                  const { width, height, x, y } = e.nativeEvent.layout;
                  positionRef.current.column[columnIndex] = horizontal ? y : x;
                  if (width > maxSize.width || height > maxSize.height) {
                    setMaxSize((prev) => ({
                      width: Math.max(prev.width, width),
                      height: Math.max(prev.height, height),
                    }));
                  }
                }}
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
                    columnIndex === nextColumn &&
                    rowIndex === nextRow &&
                    !(columnIndex === currentColumn && rowIndex === currentRow)
                      ? { borderStyle: 'dashed' }
                      : { borderColor: 'transparent' },
                  ]}
                >
                  <View
                    style={horizontal ? { flexDirection: 'row' } : { width: '100%', zIndex: 4900 }}
                  >
                    {rowIndex === 0 && (
                      <Animated.View
                        style={{
                          transform: [
                            horizontal ? { translateX: translate } : { translateY: translate },
                          ],
                        }}
                      >
                        {renderHeader({ item: column, index: columnIndex })}
                      </Animated.View>
                    )}
                    <Text style={{ color: 'gray', marginTop: horizontal && rowIndex > 0 ? 8 : 0 }}>
                      {row.name !== '' ? (columnIndex === 0 ? row.name : ' ') : ''}
                    </Text>
                  </View>
                  <FlatList
                    horizontal={horizontal}
                    data={column.items}
                    renderItem={({ item, index }) => rowList[rowIndex][columnIndex][index]}
                    CellRendererComponent={cellRendererComponent}
                    style={{
                      zIndex: columnIndex === currentColumn ? 5000 : undefined,
                      overflow: 'visible',
                      backgroundColor: 'transparent',
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
          <View
            style={[
              { backgroundColor: 'gray' },
              horizontal ? { height: '100%', width: 2 } : { width: '100%', height: 2 },
            ]}
          />
        </View>
      ))}
    </View>
  );
};
