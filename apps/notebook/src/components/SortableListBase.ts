import { useMemo } from "react";
import { Animated, LayoutChangeEvent, PanResponderInstance, ViewStyle } from "react-native";

export type Item<T> = {id:string, item:T}

export type DraggingItem = {
    locationX: number;
    pageY: number;
    id: string;
};
  
export type Strategy = {
  onDrag:(item:DraggingItem)=>{listener: ({value}:{value:number}) => void},
  onDrop:()=>void,
  itemStyle: (valueY:Animated.ValueXY['y'], dragId:string|undefined, id:string)=>Animated.WithAnimatedObject<ViewStyle> | Animated.WithAnimatedArray<ViewStyle>,
  itemOnLayout: (id:string, e:LayoutChangeEvent)=>void
};

export type RenderItem<T> = ({ item, pan }: {item: T, pan?:PanResponderInstance })=>JSX.Element

interface SortableListBaseProps<T> {
  renderItem:RenderItem<T>,
  renderDragPointer?:({item}:{item:T})=>JSX.Element,
}

export interface SortableListInternalProps<T> extends SortableListBaseProps<T> {
  data:Item<T>[],
  strategy:Strategy,
}

type SortableListOuterProps<T> = {
  data:T[]
  setData:(data:T[])=>void,
  getId:(item:T)=>string
}

export type SortableListProps<T> = SortableListBaseProps<T> & SortableListOuterProps<T>

export const useInnerState = <T,>(props:SortableListOuterProps<T>)=>{
  const data = useMemo(()=>props.data.map(item=>({id:props.getId(item), item})), [props.data])
  const setData = (newData:Item<T>[])=>props.setData(newData.map(v=>v.item))
  return [data, setData] as [Item<T>[], (items:Item<T>[])=>void]
}
