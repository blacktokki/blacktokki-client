import { View } from '@blacktokki/core';
import React, { useRef } from 'react';
import { Platform, StyleSheet } from "react-native";

// Import platform-specific components
export let DraggableFlatList: any;
export let ScaleDecorator: any;
let ReactDnd: any;
let DraggableFlatListRenderItemParams: any;

type Cell = any

// Handle platform-specific imports
if (Platform.OS === 'android' || Platform.OS === 'ios') {
  // For native platforms, import react-native-draggable-flatlist
  const DraggableImport = {} as any // require('react-native-draggable-flatlist');
  DraggableFlatList = DraggableImport.default;
  ScaleDecorator = DraggableImport.ScaleDecorator;
  DraggableFlatListRenderItemParams = DraggableImport.RenderItemParams;
} else {
  // For web, import react-dnd
  const DndImport = require('react-dnd');
  const DndHtml5Backend = require('react-dnd-html5-backend');
  ReactDnd = {
    DndProvider: DndImport.DndProvider,
    useDrag: DndImport.useDrag,
    useDrop: DndImport.useDrop,
    HTML5Backend: DndHtml5Backend.HTML5Backend
  };
}

// 웹 환경용 Draggable Cell Item 수정
const DraggableCellItem = ({ 
    item, 
    index, 
    moveItem, 
    renderCellContent, 
    draggingItemIndexRef
  }: { 
    item: Cell, 
    index: number, 
    moveItem: (dragIndex: number, hoverIndex: number) => void, 
    renderCellContent: (item: Cell, isDragging: boolean) => React.ReactNode,
    draggingItemIndexRef: React.MutableRefObject<number | null>
  }) => {
    const ref = useRef<HTMLDivElement>(null);
    const dragHandleRef = useRef<HTMLDivElement>(null);
  
    const isDraggable = draggingItemIndexRef.current === null;
  
    const [{ isDragging }, drag, preview] = ReactDnd.useDrag({
      type: 'CELL',
      item: () => {
        if (!isDraggable) {
          return { index: -1 };
        }
        draggingItemIndexRef.current = index; // 드래그 시작 시 인덱스 설정
        return { index };
      },
      collect: (monitor: any) => ({ 
        isDragging: monitor.isDragging() && isDraggable
      }),
      canDrag: () => isDraggable,
      end: () => {
        draggingItemIndexRef.current = null; // 드래그 종료 시 인덱스 초기화
      }
    });
  
    const [, drop] = ReactDnd.useDrop({
      accept: 'CELL',
      hover(item: { index: number }, monitor: any) {
        if (!ref.current || !isDraggable) {
          return;
        }
        const dragIndex = item.index;
        const hoverIndex = index;
  
        if (dragIndex === hoverIndex || dragIndex === -1) {
          return;
        }
  
        moveItem(dragIndex, hoverIndex);
        item.index = hoverIndex;
      },
    });
  
    const dragHandle = () => {
      if (dragHandleRef.current && isDraggable) {
        drag(dragHandleRef);
      }
    };
  
    preview(drop(ref));
  
    return (
      <div 
        ref={ref} 
        style={{ 
          opacity: isDragging ? 0.5 : 1,
          position: 'relative'
        }}
      >
        {isDraggable && (
          <div 
            ref={dragHandleRef} 
            style={{ 
              cursor: 'move', 
              width: 40, 
              position: 'absolute', 
              height: '100%', 
              zIndex: 10,
              left: 0,
              top: 0
            }} 
            onMouseDown={dragHandle} 
          />
        )}
        {renderCellContent(item, isDragging)}
      </div>
    );
  };
  
  // 웹용 Sortable List 수정
  export const SortableCellsList = ({ 
    items, 
    onSortEnd, 
    renderCellContent
  }: { 
    items: Cell[], 
    onSortEnd: (items: Cell[]) => void, 
    renderCellContent: (item: Cell, isDragging: boolean) => React.ReactNode
  }) => {
    const draggingItemIndexRef = useRef<number | null>(null);
  
    const moveItem = (dragIndex: number, hoverIndex: number) => {
      const draggedItem = items[dragIndex];
      const newItems = [...items];
      newItems.splice(dragIndex, 1);
      newItems.splice(hoverIndex, 0, draggedItem);
      onSortEnd(newItems);
    };
  
    return (
      <ReactDnd.DndProvider backend={ReactDnd.HTML5Backend}>
        <View style={commonStyles.cellsList}>
          {items.map((item, index) => (
            <DraggableCellItem 
              key={item.id} 
              item={item} 
              index={index} 
              moveItem={moveItem} 
              renderCellContent={renderCellContent} 
              draggingItemIndexRef={draggingItemIndexRef}
            />
          ))}
        </View>
      </ReactDnd.DndProvider>
    );
  };


  const commonStyles = StyleSheet.create({
    cellsList:{
      paddingVertical: 10,
      paddingHorizontal: 5,
    }
  })