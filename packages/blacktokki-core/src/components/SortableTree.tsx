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
  parentId?: string;
  name: string;
  type: 'file' | 'folder';
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
    nodes: string[];
    moveables: string[];
  };
  setItem: (item?: DraggingItem) => void;
};

const initialData: DataItem[] = [
  { id: '1', name: 'Documents', type: 'folder' },
  { id: '2', name: 'Resume.docx', type: 'file', parentId: '1' },
  { id: '3', name: 'Work', type: 'folder', parentId: '1' },
  { id: '4', name: 'ProjectA', type: 'folder', parentId: '3' },
  { id: '5', name: 'Pictures', type: 'folder' },
  { id: '6', name: 'Music', type: 'folder' },
  { id: '7', name: 'Resume2.docx', type: 'file', parentId: '1' },
];

const rootId = '0';

const flatNode = (data: DataItem[]): FlatNode[] => {
  const flatNodes: FlatNode[] = data.map((v) => ({ ...v, children: [], path: [], namePath: '' }));
  for (const node of flatNodes) {
    const parent = flatNodes.find((v) => v.id === node.parentId);
    if (parent) {
      parent.children.push(node);
    }
  }
  const queue = flatNodes.filter((v) => v.parentId === undefined);
  while (queue.length > 0) {
    const node = queue.shift();
    if (node) {
      const parent = flatNodes.find((v) => v.id === node?.parentId);
      node.path = parent?.path !== undefined ? [...parent.path, node.id] : [node.id];
      node.namePath =
        parent?.namePath !== undefined
          ? parent.namePath + '.' + (node.type === 'file') + node.name
          : (node.type === 'file') + node.name;
      flatNodes.filter((v) => v.parentId === node.id).forEach((v) => queue.push(v));
    }
  }
  flatNodes.sort((a, b) => {
    return a.namePath > b.namePath ? 1 : -1;
  });
  return flatNodes;
};

const isChild = (nodes: FlatNode[], child: string, parent: string): boolean => {
  return nodes.find((v) => v.id === child)?.path.find((v) => v === parent) !== undefined;
};

const getMoveableNodes = (nodes: FlatNode[], draggingNodes: Set<string>): string[] => {
  return [...draggingNodes].filter((child) => {
    return (
      [...draggingNodes].find((parent) => {
        return isChild(nodes, child, parent) && child !== parent;
      }) === undefined
    );
  });
};

const useHover = (
  flatNodes: FlatNode[],
  draggingRef: React.MutableRefObject<DraggingRef | undefined>
) => {
  const [rootHover, setRootHover] = useState(false);
  const [originHoverNode, setOriginHoverNode] = useState<FlatNode>();
  const hoverRef = useRef<string>(undefined);
  const hoverNode =
    (draggingRef.current?.items === undefined || originHoverNode?.type === 'folder'
      ? originHoverNode?.id
      : originHoverNode?.parentId) || '';
  const hoverNodes =
    draggingRef.current?.items === undefined
      ? [hoverNode]
      : [
          ...flatNodes.filter((v) => isChild(flatNodes, v.id, hoverNode)).map((v) => v.id),
          hoverNode,
        ];
  const hoverSelected =
    draggingRef.current?.items === undefined ||
    (draggingRef.current.items.moveables.filter(
      (n) =>
        isChild(flatNodes, hoverNode, n) ||
        hoverNode === n ||
        flatNodes.find((v) => v.id === n)?.parentId === hoverNode
    ).length === 0 &&
      flatNodes.find((v) => v.id === hoverNode)?.type === 'folder');
  const rootSelected =
    draggingRef.current?.items !== undefined && originHoverNode === undefined && rootHover;
  hoverRef.current = hoverSelected ? hoverNode : rootSelected ? rootId : undefined;
  // console.log(draggingRef.current?.items?.moveables,"to", hoverRef.current)
  const isHoverId = (id: string) => hoverNodes.find((v) => v === id) && hoverSelected;
  return { rootSelected, hoverRef, isHoverId, setRootHover, setOriginHoverNode };
};

const TreeItem = React.memo(
  (props: {
    node: FlatNode;
    handleNodePress: (id: string, e: NativeTouchEvent) => void;
    draggingRef: React.MutableRefObject<DraggingRef | undefined>;
  }) => {
    const draggingItemRef = useRef<DraggingItemRef>(undefined);
    const setDragging = (id?: string) => {
      props.draggingRef.current?.setItem(
        id !== undefined ? ({ ...draggingItemRef.current, id } as DraggingItem) : undefined
      );
    };
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
        style={{ paddingLeft: level * 20 }}
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
            {props.node.type === 'folder' ? '▼' : '*'} {props.node.name}
          </Text>
        }
        {/* <Animated.View style={{borderWidth:1, borderColor:'#8888', position:'absolute', height:20, transform: [{ translateX: draggingItemRef.current?.pan.x || 0 }, { translateY: draggingItemRef.current?.pan.y || 0 }], display:isDrag?'flex':'none'}}/> */}
      </Animated.View>
    );
  }
);

const DragPointer = React.memo(
  ({
    flatNodes,
    selectedNodes,
    draggingRef,
  }: {
    flatNodes: FlatNode[];
    selectedNodes: Set<string>;
    draggingRef: React.MutableRefObject<DraggingRef | undefined>;
  }) => {
    const [dragNode, setDragNode] = useState<DraggingItem>();
    const nodes = dragNode
      ? selectedNodes.has(dragNode.id)
        ? [...selectedNodes]
        : [dragNode.id]
      : [];
    draggingRef.current = {
      items:
        dragNode && selectedNodes.has(dragNode.id)
          ? {
              nodes,
              moveables: getMoveableNodes(flatNodes, new Set(nodes)),
            }
          : undefined,
      setItem: setDragNode,
    };
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
        <Text selectable={false}>
          {nodes.length > 1 ? nodes.length : flatNodes.find((v) => v.id === dragNode?.id)?.name}
        </Text>
      </Animated.View>
    );
  }
);

const DraggableTree = () => {
  const [data, setData] = useState<DataItem[]>(initialData);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [lastSelectedNode, setLastSelectedNode] = useState<string | null>(null);
  const flatNodes = useMemo(() => flatNode(data), [data]);
  const draggingRef = useRef<DraggingRef>(undefined);
  const { rootSelected, hoverRef, isHoverId, setRootHover, setOriginHoverNode } = useHover(
    flatNodes,
    draggingRef
  );

  const handleNodeSelect = (id: string, event: any) => {
    const isCtrlPressed = event.metaKey || event.ctrlKey;
    const isShiftPressed = event.shiftKey;

    if (isCtrlPressed) {
      // Toggle selection for the clicked node
      setSelectedNodes((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return newSet;
      });
    } else if (isShiftPressed && lastSelectedNode) {
      // Select range between lastSelectedNode and current node
      const lastIndex = flatNodes.findIndex((node) => node.id === lastSelectedNode);
      const currentIndex = flatNodes.findIndex((node) => node.id === id);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const [start, end] = [lastIndex, currentIndex].sort((a, b) => a - b);
        const range = flatNodes.slice(start, end + 1).map((node) => node.id);
        setSelectedNodes((prev) => {
          const newSet = new Set(prev);
          range.forEach((nodeId) => newSet.add(nodeId));
          return newSet;
        });
      }
    } else {
      // Single selection
      setSelectedNodes(new Set([id]));
    }

    setLastSelectedNode(id);
  };
  const handleNodeMove = (id: string, event: any) => {
    if (hoverRef.current !== undefined) {
      console.log(draggingRef.current?.items?.moveables, 'to', hoverRef.current, 'moved');
      setData(
        data.map((d) =>
          draggingRef.current?.items?.moveables
            .filter((v) => hoverRef.current !== v)
            .find((v) => v === d.id) !== undefined
            ? { ...d, parentId: hoverRef.current === rootId ? undefined : hoverRef.current }
            : d
        )
      );
      setSelectedNodes(new Set());
      setLastSelectedNode(null);
    }
  };

  const handleNodePress = useCallback(
    (id: string, event: any) => {
      if (draggingRef.current?.items === undefined) {
        handleNodeSelect(id, event);
      } else {
        handleNodeMove(id, event);
      }
    },
    [data, selectedNodes, lastSelectedNode]
  );

  const renderTree = (node: FlatNode) => {
    const isHover = rootSelected || isHoverId(node.id);
    return (
      <View
        key={node.id}
        style={[
          styles.node,
          isHover ? styles.hovered : null,
          selectedNodes.has(node.id) ? styles.selected : null,
        ]}
        //@ts-ignore
        onMouseEnter={() => {
          setOriginHoverNode(node);
        }}
        onMouseLeave={() => {
          setOriginHoverNode(undefined);
        }}
      >
        <TreeItem
          key={node.id}
          node={node}
          handleNodePress={handleNodePress}
          draggingRef={draggingRef}
        />
      </View>
    );
  };

  return (
    <>
      <FlatList
        data={flatNodes}
        renderItem={({ item: node }) => renderTree(node)}
        //@ts-ignore
        onMouseEnter={() => {
          setRootHover(true);
        }}
        onMouseLeave={() => {
          setRootHover(false);
        }}
        contentContainerStyle={[{ flexGrow: 1 }, rootSelected ? styles.hovered : null]}
      />
      <DragPointer flatNodes={flatNodes} selectedNodes={selectedNodes} draggingRef={draggingRef} />
    </>
  ) as React.JSX.Element;
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
