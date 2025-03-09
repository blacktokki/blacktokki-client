import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  NativeTouchEvent,
  FlatList,
} from 'react-native';

type DataItem = {
  id: string;
  name: string;
};

type FlatNode = DataItem & {
  children: FlatNode[];
  path: string[];
  namePath: string;
};

type DraggingItemRef = {
  locationX: number;
  pageY: number;
  pan: Animated.ValueXY;
};

type DraggingItem = DraggingItemRef & {
  id: string;
};

type DraggingRef = {
  items?: {
    node: string;
    directions: {id:string, value:Animated.Value}[]
  };
  setItem: (item?: DraggingItem) => void;
};

type HeightRef = Record<string, number>

const initialData: DataItem[] = [
  { id: '1', name: 'Documents',},
  { id: '2', name: 'Resume.docx', },
  { id: '3', name: 'Work',},
  { id: '4', name: 'ProjectA', },
  { id: '5', name: 'Pictures',},
  { id: '6', name: 'Music',  },
  { id: '7', name: 'Resume2.docx', },
];

const flatNode = (data: DataItem[]): FlatNode[] => {
  const flatNodes: FlatNode[] = data.map((v) => ({ ...v, children: [], path: [], namePath: '' }));
  return flatNodes;
};

const TreeItem = React.memo(
  (props: {
    node: FlatNode;
    handleNodePress: (id: string, e: NativeTouchEvent) => void;
    draggingRef: React.MutableRefObject<DraggingRef | undefined>;
    heightRef: React.MutableRefObject<HeightRef>;
  }) => {
    const draggingItemRef = useRef<DraggingItemRef>();
    const setDragging = (id?: string) => {
      props.draggingRef.current?.setItem(
        id !== undefined ? ({ ...draggingItemRef.current, id } as DraggingItem) : undefined
      );
    };
    const basePan = new Animated.Value(0)
    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        draggingItemRef.current = {
          locationX: e.nativeEvent.locationX,
          pageY: e.nativeEvent.pageY,
          pan: new Animated.ValueXY(),
        };
      },
      onPanResponderMove: (...args) => {
        setDragging(props.node.id);
        if (draggingItemRef.current) {
          Animated.event(
            [null, { dx: draggingItemRef.current.pan.x, dy: draggingItemRef.current.pan.y }],
            { useNativeDriver: false }
          )(...args);
        }
      },
      onPanResponderRelease: (e) => {
        props.handleNodePress(props.node.id, e.nativeEvent);
        setDragging(undefined);
      },
    });
    const level = props.node.path.length - 1;
    return (
      <Animated.View
        {...panResponder.panHandlers}
        style={{ paddingLeft: level * 20, transform:[{translateY: basePan}] }}
        onLayout={(e)=>{props.heightRef.current[props.node.id] = e.nativeEvent.layout.height}}
        //@ts-ignore
        onClick={(e) => {
          if (e.ctrlKey) {
            props.handleNodePress(props.node.id, e);
            setDragging(undefined);
          } else {
            e.stopPropagation();
          }
        }}
      >
        {
          <Text selectable={false} style={styles.text}>
            {props.node.name}
          </Text>
        }
      </Animated.View>
    );
  }
);

const DragPointer = React.memo(
  ({
    flatNodes,
    draggingRef,
    heightRef,
  }: {
    flatNodes: FlatNode[];
    draggingRef: React.MutableRefObject<DraggingRef | undefined>;
    heightRef: React.MutableRefObject<HeightRef>;
  }) => {
    const [dragNode, setDragNode] = useState<DraggingItem>();
    if(dragNode){
      const h = flatNodes.map(v=>heightRef.current[v.id]).reduce((prev, _, i, arr)=>{prev.push(i>0?arr[i] + prev[prev.length -1]:arr[i]);  return prev}, [] as number[])
      const nowI = flatNodes.findIndex(v=>v.id===dragNode.id)
      const nowHCum = heightRef.current[dragNode.id]
      const currentIndex = dragNode.pan.y.interpolate({
        inputRange:[0, 1],
        outputRange:[0, 1],
        easing: (input)=>{
          const now = h[nowI] + input
          let ii = 0;
          for(const hh of h){
            if (now < hh){
              break
            }
            ii+=1;
          }
          return ii
        }
      })
      const directions = flatNodes.map((v, i)=>{
        if (v.id===dragNode.id){
          return {id:v.id, value: dragNode.pan.y}
        }
        return {id:v.id, value: currentIndex.interpolate({
          inputRange:[0, 1],
          outputRange:[0, 1],
          easing: (input)=>{
            if (input<i && i < nowI)
              return nowHCum;
            if (nowI < i && i < input)
              return -nowHCum
            return 0
          }
        })}
      })
      draggingRef.current = {
        items:{
          node:dragNode.id,
          directions: directions as any
        },
        setItem: setDragNode,
      }
    }
    else{
      draggingRef.current = {
        items: undefined,
        setItem: setDragNode,
      };
    }
    
    return (
      <Animated.View
        style={{
          position: 'absolute',
          height: 1,
          left: dragNode?.locationX,
          top: (dragNode?.pageY || 0) - 20,
          transform: [{ translateX: dragNode?.pan.x || 0 }, { translateY: dragNode?.pan.y || 0 }],
          display: draggingRef.current !== undefined ? 'flex' : 'none',
        }}
      >
        <Animated.Text selectable={false}>
          {flatNodes.find((v) => v.id === dragNode?.id)?.name}
        </Animated.Text>
      </Animated.View>
    );
  }
);

const DraggableTree = () => {
  const [data, setData] = useState<DataItem[]>(initialData);
  const flatNodes = useMemo(() => flatNode(data), [data]);
  const draggingRef = useRef<DraggingRef>();
  const heightRef = useRef<HeightRef>({})

  const renderTree = (node: FlatNode) => {
   // const isHover = rootSelected || isHoverId(node.id);
    return (
      <View
        key={node.id}
        style={[
          styles.node,
          // isHover ? styles.hovered : null,
          // selectedNodes.has(node.id) ? styles.selected : null,
        ]}
        // //@ts-ignore
        // onMouseEnter={() => {
        //   setOriginHoverNode(node);
        // }}
        // onMouseLeave={() => {
        //   setOriginHoverNode(undefined);
        // }}
      >
        <TreeItem
          key={node.id}
          node={node}
          handleNodePress={()=>{}}
          draggingRef={draggingRef}
          heightRef={heightRef}
        />
      </View>
    );
  };
  console.log(heightRef.current)
  return (
    <>
      <FlatList
        data={flatNodes}
        renderItem={({ item: node }) => renderTree(node)}
        //@ts-ignore
        // onMouseEnter={() => {
        //   setRootHover(true);
        // }}
        // onMouseLeave={() => {
        //   setRootHover(false);
        // }}
        contentContainerStyle={[{ flexGrow: 1 },]}
      />
      <DragPointer flatNodes={flatNodes} draggingRef={draggingRef} heightRef={heightRef}/>
    </>
  ) as JSX.Element;
};

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

export default DraggableTree;
