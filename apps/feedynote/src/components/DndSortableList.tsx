import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
// @ts-ignore
import { MaterialIcons as Icon } from 'react-native-vector-icons';
import { RenderItem, SortableListProps } from './SortableListBase';

// Import platform-specific components
let DraggableFlatList: any;
let ScaleDecorator: any;

// For web, import specific versions of dnd-kit components
// @dnd-kit/core@3.0.3, @dnd-kit/sortable@3.0.1, @dnd-kit/utilities@2.0.0
let DndCore: any;
let DndSortable: any;
let DndUtilities: any;

// Handle platform-specific imports
if (Platform.OS === 'android' || Platform.OS === 'ios') {
  // For native platforms, import react-native-draggable-flatlist
  const DraggableImport = {} as any; // require('react-native-draggable-flatlist');
  DraggableFlatList = DraggableImport.default;
  ScaleDecorator = DraggableImport.ScaleDecorator;
} else {
  // For web, import dnd-kit with specific versions
  DndCore = require('@dnd-kit/core');
  DndSortable = require('@dnd-kit/sortable');
  DndUtilities = require('@dnd-kit/utilities');
}

// Web environment Draggable Cell Item using dnd-kit
const DraggableCellItem = <T, >({ 
  item, 
  code,
  renderCellContent,
}: { 
  item: T, 
  code: string,
  renderCellContent: RenderItem<T>,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = DndSortable.useSortable({ id:code });

  const style = {
    transform: DndUtilities.CSS.Transform.toString(transform ? {
      x: transform.x,
      y: transform.y,
      scaleX: 1,
      scaleY: 1
    } : null),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    flex: 1,
    zIndex: isDragging ? 1 : 0
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
    >
      <div 
        {...attributes}
        {...listeners}
        style={{ 
          cursor: 'move', 
          width: 40, 
          position: 'absolute', 
          height: '100%', 
          zIndex: 10,
          left: 0,
          top: 0
        }}
      />
      {renderCellContent({item})}
    </div>
  );
};

// Web Sortable List using dnd-kit
const SortableCellsList = <T, >({ 
  items, 
  onSortEnd, 
  renderCellContent,
  getId
}: { 
  items: T[], 
  onSortEnd: (items: T[]) => void, 
  renderCellContent: RenderItem<T>,
  getId:(item:T)=>string,
}) => {
  const [codes, setCodes] = useState(items.map(v=>''+ getId(v)))
  const [tempCodes, setTempCodes] = useState<string[]>()
  useEffect(()=>{
    if (tempCodes){
      setCodes(tempCodes)
      setTempCodes(undefined)
    }
    else if (items.length !== codes.length || items.filter((v, i)=>!codes[i].endsWith(getId(v))).length>0){
      setCodes((codes)=>{
        return items.map((v, i)=>i<codes.length && codes[i].endsWith(getId(v))?codes[i]:Date.now().toString() + '@'+getId(v)).slice(0, items.length)
      })
    }
  }, [items])
  const sensors = DndCore.useSensors(
    DndCore.useSensor(DndCore.PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    DndCore.useSensor(DndCore.KeyboardSensor, {
      coordinateGetter: DndSortable.sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = codes.findIndex((item) => item === active.id);
      const newIndex = codes.findIndex((item) => item === over.id);
      const idx = DndSortable.arrayMove(Array.from(Array(items.length).keys()), oldIndex, newIndex)
      setTempCodes(DndSortable.arrayMove(codes, oldIndex, newIndex).map((v:string, i:number)=>i>idx[i]?'@'+v:v))
      onSortEnd(DndSortable.arrayMove(items, oldIndex, newIndex));
    }
  };
  return (
    <DndCore.DndContext
      sensors={sensors}
      collisionDetection={DndCore.closestCenter}
      onDragEnd={handleDragEnd}
    >
      <DndSortable.SortableContext
        items={tempCodes || codes}
        strategy={DndSortable.verticalListSortingStrategy}
      >
        <View style={commonStyles.cellsList}>
          {items.map((item, i) => {
            const code = (tempCodes || codes)[i]
            return <DraggableCellItem
              key={code || '' + getId(item)}
              code={code}
              item={item}
              renderCellContent={renderCellContent}
            />
})}
        </View>
      </DndSortable.SortableContext>
    </DndCore.DndContext>
  );
};

// Choose the appropriate list component based on platform
const SortableList = <T, >({data, setData:setItems, getId, renderItem:renderContent}:SortableListProps<T>) => {
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    return (
      <DraggableFlatList
        data={data}
        onDragEnd={({ data }: { data: T[] }) => setItems(data)}
        keyExtractor={(item: any) => item.id.toString()}
        renderItem={({ item, drag, isActive }: any) => {
          return (
            <ScaleDecorator>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity
                  onLongPress={drag} 
                  style={{ 
                    width: 40,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Icon name="drag-handle" size={20} color="#888" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  {renderContent(item)}
                </View>
              </View>
            </ScaleDecorator>
          );
        }}
        contentContainerStyle={commonStyles.cellsList}
      />
    );
  } else {
    return (
      <SortableCellsList
        items={data}
        getId={getId}
        onSortEnd={setItems}
        renderCellContent={renderContent}
      />
    );
  }
};

const commonStyles = StyleSheet.create({
  cellsList: {
    paddingVertical: 10,
    paddingHorizontal: 5,
  }
});

export default SortableList;
