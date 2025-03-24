import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  FlatList,
} from 'react-native';
import { Item, DraggingItem, SortableListInternalProps, SortableListProps, Strategy, RenderItem, useInnerState } from './SortableListBase';

interface DraggingRef {
  item?: DraggingItem;
  setItem?: (item?: DraggingItem) => void;
};

interface NodeItemProps<T> {
    node: Item<T>;
    renderItem:RenderItem<T>;
    draggingRef: React.MutableRefObject<DraggingRef>;
    panValue: Animated.ValueXY;
    stratgy:Strategy
}


const NodeItemRaw = <T, >(props: NodeItemProps<T>) => {
  const draggingItemRef = useRef<DraggingItem>();
  const setDragging = (isDrag:boolean) => {
    draggingItemRef.current && props.draggingRef.current?.setItem?.(isDrag?{ ...draggingItemRef.current }: undefined);
  };
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      draggingItemRef.current = {
        locationX: e.nativeEvent.locationX,
        pageY: e.nativeEvent.pageY,
        id: props.node.id,
      };
    },
    onPanResponderMove: (...args) => {
      if (props.draggingRef.current.item===undefined){
        setDragging(true);
      }
      if (draggingItemRef.current) { 
        Animated.event(
          [null, { dx: props.panValue.x, dy: props.panValue.y }],
          { useNativeDriver: false }
        )(...args);
      }
    },
    onPanResponderRelease: (e) => {
      setDragging(false);
    },
  });
  return (
    <Animated.View
      style={[props.stratgy.itemStyle(props.panValue.y, props.draggingRef.current?.item?.id, props.node.id)]}
      onLayout={(e)=>props.stratgy.itemOnLayout(props.node.id, e)}
    >
      {props.renderItem({...props.node, pan:panResponder})}
    </Animated.View>
  );
};

const NodeItem = React.memo(NodeItemRaw) as typeof NodeItemRaw
  
const DragPointer = <T, >({
  data,
  renderDragPointer,
  draggingRef,
  strategy,
  panValue
}: {
  data: Item<T>[];
  renderDragPointer?:({item}:{item:T})=>JSX.Element;
  draggingRef: React.MutableRefObject<DraggingRef>;
  strategy:Strategy;
  panValue: Animated.ValueXY
}) => {
  const [dragNode, setDragNode] = useState<DraggingItem>();
  useEffect(()=>{
    if(dragNode){
      const dragData = strategy.onDrag(dragNode);
      draggingRef.current.item = dragNode
      draggingRef.current.setItem = setDragNode
      const listener = panValue.y.addListener(dragData.listener)
      return ()=>panValue.y.removeListener(listener);
    }
    else{
      strategy.onDrop();
      draggingRef.current.item = undefined
      draggingRef.current.setItem = setDragNode
      panValue.setValue({x:0, y:0})
    }
  }, [dragNode])
  const item = data.find((v) => v.id === dragNode?.id)?.item
  return (
    <Animated.View
      style={{
        position: 'absolute',
        height: 1,
        left: dragNode?.locationX,
        top: (dragNode?.pageY || 0) - 20,
        transform: [{ translateX: panValue.x || 0 }, { translateY: panValue.y || 0 }],
        display: draggingRef.current !== undefined ? 'flex' : 'none',
      }}
    >
      {item && renderDragPointer?.({item})}
    </Animated.View>
  );
};

type StrategyRef = {
  directions?: Record<string, {y:number, order:number}>
  height: Record<string, number>
}

const SortableListInternal = <T, >({data, strategy, renderItem, renderDragPointer}:SortableListInternalProps<T>) => {
  const draggingRef = useRef<DraggingRef>({});
  const panValue = new Animated.ValueXY()
  const _renderItem = ({ item: node }: {item: Item<T>}) => {
    return <NodeItem
        key={node.id}
        node={node}
        renderItem={renderItem}
        stratgy={strategy}
        draggingRef={draggingRef}
        panValue={panValue}
      />
  };
  return (
    <>
      <FlatList
        data={data}
        renderItem={_renderItem}
        CellRendererComponent={props=>props.children}
        contentContainerStyle={[{ flexGrow: 1 },]}
      />
      <DragPointer data={data} renderDragPointer={renderDragPointer} draggingRef={draggingRef} strategy={strategy} panValue={panValue}/>
    </>
  ) as JSX.Element;
};

const SortableList = <T, >(props:SortableListProps<T>) => {
  const [data, setData] = useInnerState(props)
  const strategyRef = useRef<StrategyRef>({height:{}})
  const strategy:Strategy = {
    onDrag: (dragItem)=>{
      const dragId = dragItem.id;
      const from = data.findIndex(v=>v.id===dragId)
      const h = data.map((v, i)=>{
        if (i>from){
          return data.filter((v2, i2)=> from< i2 && i2<i).map(v2=>strategyRef.current.height[v2.id]).reduce((a,b)=>a+b,0) + strategyRef.current.height[v.id]/2
        }
        else if(i<from){
          return data.filter((v2, i2)=> i< i2 && i2<from).map(v2=>-strategyRef.current.height[v2.id]).reduce((a,b)=>a+b,0) - strategyRef.current.height[v.id]/2
        }
        return 0
      })
      const nowHCum = strategyRef.current.height[dragId]
      return {
        listener: ({value})=>{
          const directions = Object.fromEntries(data.map((v, i)=>{
            if (v.id===dragId){
              return [v.id, {y:value, order:0}]
            }
            if (value<h[i] && i < from)
              return [v.id, {y:nowHCum, order:1}];
            if (from < i && h[i] < value)
              return [v.id, {y:-nowHCum, order:-1}]
            if (i<from)
              return [v.id, {y:0, order:-2}]
            if (from<i)
              return [v.id, {y:0, order:2}]
            return [v.id, {y:0, order:0}]
            }))
          strategyRef.current.directions = directions
        }
      }
    },
    onDrop: ()=>{
      if (strategyRef.current.directions){
        const newData = [...data].sort((a, b)=> {
          const aOrder = strategyRef.current.directions?.[a.id].order;
          const bOrder = strategyRef.current.directions?.[b.id].order;
          if (aOrder!==undefined && bOrder !==undefined){
            return aOrder - bOrder
          }
          return 0
        })
        setData(newData)
        strategyRef.current.directions = undefined
      }
    },
    itemStyle: (valueY, dragId, id)=>{
      const yValue = valueY.interpolate({
        inputRange:[0, 1], outputRange: [0, 1],
        easing: (input)=>{
          return strategyRef.current?.directions?.[id].y || 0
        }
      })
      const zValue = valueY.interpolate({
        inputRange:[0, 1], outputRange: [0, 1],
        easing: (input)=>{
          return dragId === id?10:0
        }
      })
      return [styles.node, { transform:[{translateY: yValue}], zIndex:zValue}]
    },
    itemOnLayout: (id, e)=>{strategyRef.current.height[id] = e.nativeEvent.layout.height}
  };
  return <SortableListInternal {...props} data={data} strategy={strategy}/>
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: '#fff',
  },
  node: {
    borderColor: '#ddd',
    backgroundColor: 'white',
  },
  hovered: {
    backgroundColor: '#f0f0f0',
  },
  selected: {
    backgroundColor: '#c0e4ff',
  },
  text: {
    padding: 5,
    fontSize: 16,
  },
});

export default SortableList;

// const initialData: Item<string>[] = [
//   { id: '1', item: 'Documents',},
//   { id: '2', item: 'Resume.docx\n asdasdas\n asdasdas\n asdasdas\n asdasdas\n asdasdas\n asdasdas', },
//   { id: '3', item: 'Work',},
//   { id: '4', item: 'ProjectA\n asdasdas\n asdasdas\n asdasdas\n asdasdas\n asdasdas\n asdasdas', },
//   { id: '5', item: 'Pictures',},
//   { id: '6', item: 'Music',  },
//   { id: '7', item: 'Resume2.docx', },
// ];


// const Test = ()=>{
//   const [data, setData] = useState<Item<string>[]>(initialData);
//   return <SortableList
//     data={data}
//     setData={setData}
//     getId={item=>item.id}
//     renderItem={({item, pan})=><Text {...pan?.panHandlers} selectable={false} style={styles.text}>
//         {item.item}
//     </Text>}
//     renderDragPointer={({item})=><Animated.Text selectable={false} style={styles.text}>
//         {/* {item} */}
//     </Animated.Text>}
//   />
// }

