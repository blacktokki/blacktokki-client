import React, { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Editor, EditorViewer } from '@blacktokki/editor';
import { View } from 'react-native';

// 드래그 핸들 컴포넌트
const DragHandle = ({ attributes, listeners }:any) => {
  return (
    <div 
      className="drag-handle" 
      {...attributes} 
      {...listeners}
      style={{
        width: '24px',
        height: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'grab',
        marginRight: '12px',
        color: '#888',
      }}
    >
      ⋮⋮
    </div>
  );
};

// 정렬 가능한 아이템 컴포넌트
const SortableItem = ({ code, item }:any) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id:code });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: 'flex',
    alignItems: 'center',
    padding: '16px',
    background: 'white',
    border: '1px solid #ddd',
    borderRadius: '4px',
    marginBottom: '8px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <DragHandle attributes={attributes} listeners={listeners} />
        <EditorViewer value={item.content} active theme='light' autoResize/>
    </div>
  );
};

// 메인 정렬 가능한 리스트 컴포넌트
const SortableList = () => {
  const data = [
    { id: 1, content: '아이템 1' },
    { id: 2, content: '아이템 2' },
    { id: 3, content: '아이템 3' },
    { id: 4, content: '아이템 4' },
    { id: 5, content: '아이템 5' },
  ]
  const [items, setItems] = useState(data);
  const [codes, setCodes] = useState(data.map(v=>''+v.id))
  console.log('@', codes)
  // 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 드래그 종료 시 아이템 위치 변경
  const handleDragEnd = (event:any) => {
    const { active, over } = event;
    
    if (active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item, i) => codes[i] === active.id);
        const newIndex = items.findIndex((item, i) => codes[i] === over.id);
        console.log(oldIndex, newIndex)
        return arrayMove(items, oldIndex, newIndex)
      });
      setCodes((codes)=>{
        const oldIndex = codes.findIndex((item) => item === active.id);
        const newIndex = codes.findIndex((item) => item === over.id);
        const idx = arrayMove(Array.from(Array(items.length).keys()), oldIndex, newIndex)
        const res = arrayMove(codes, oldIndex, newIndex).map((v, i)=>i>idx[i]?'@'+v:v)
        return res
      })
    }
  };

  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={closestCenter} 
      onDragEnd={handleDragEnd}
    >
      <div style={{ width: '100%', maxWidth: '500px', margin: '0 auto' }}>
        <h2>정렬 가능한 리스트</h2>
        <p>왼쪽의 핸들(⋮⋮)을 사용하여 아이템을 드래그하세요</p>
        
        <SortableContext items={codes} strategy={verticalListSortingStrategy}>
          {items.map((item, i) => (
            <SortableItem key={codes[i]} code={codes[i]} item={item} />
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
};

export default SortableList;