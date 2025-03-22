// App.tsx
import React, { useState, useCallback, MutableRefObject, useEffect, useRef, useMemo } from 'react';
import { 
  SafeAreaView, 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  StyleProp,
  ViewStyle,
} from 'react-native';
// @ts-ignore
import {MaterialIcons as Icon} from 'react-native-vector-icons';
import { useColorScheme, useLangContext } from '@blacktokki/core';
import { CellType } from '../../types';
import { previewScrap } from '../../services/notebook';
import SortableList from '../../components/DndSortableList';
import Cell, { CellItem, ExecutionStatus, typeDetail } from '../../components/Cell';

const execute = (type:CellType, query: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      if (type==='LINK'){
        resolve(previewScrap({query}).then(v=>JSON.stringify(v)))
      }
      else if(type==='MARKDOWN'){
        console.log("TEMP")
      }
      else {
        resolve("")
      }
    } catch (error) {
      reject(`Error: ${error}`);
    }
  });
};

export type CellHistory = {past:string[][], present:string[], future:string[][], cells:Record<string,CellItem>}

const App = (props: {cellsHistory:CellHistory, setHistory:(data:CellHistory)=>void, cellRef:MutableRefObject<{executeAllCells:()=>Promise<void>}|undefined>}) => {
  const theme = useColorScheme()
  const { lang } = useLangContext()
  const cellsHistory = props.cellsHistory
  const cells = cellsHistory?.present.map(v=>cellsHistory.cells[v])
  const _setCells = (_cells:CellItem[]) => {
    if (JSON.stringify(cells) === JSON.stringify(_cells)){
      return;
    }
    const newCells = cellsHistory?.cells || {}
    _cells.forEach(v=>{newCells[v.id] = v})
    props.setHistory({
      past: cellsHistory?[ ...cellsHistory.past, cellsHistory.present]:[],
      present:_cells.map(v=>v.id),
      future: [],
      cells:newCells,
    })
  }
  const undo = () =>{
    if(cellsHistory && cellsHistory.past.length>0){
      const previous = cellsHistory.past[cellsHistory.past.length - 1];
      const newPast = cellsHistory.past.slice(0, cellsHistory.past.length - 1);
      props.setHistory({
        past: newPast,
        present:previous,
        future: [cellsHistory.present, ...cellsHistory.future],
        cells:cellsHistory.cells,
      })
    }
  }
  const redo = () => {
    if(cellsHistory && cellsHistory.future.length>0){
      const next = cellsHistory.future[0];
      const newFuture = cellsHistory.future.slice(1);
      props.setHistory({
        past: [...cellsHistory.past, cellsHistory.present],
        present:next,
        future: newFuture,
        cells:cellsHistory.cells,
      })
    }
  }
  const setCells = (func:(c:CellItem[])=>CellItem[])=>_setCells(func(cells))

  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const heightRef = useRef<Record<string, number>>({})
  const nextExecutionCount = useMemo(()=>{
    const counts = cells.map(v=>v.executionCount).filter(v=>v!==null)
    return counts.length>0?counts.sort((a,b)=>b-a)[0]+1:1
  }, [cells])
  useEffect(()=>{
    props.cellRef.current = {
      executeAllCells: async () => {
        for (const cell of cells) {
          if (typeDetail[cell.type].executable) {
            await executeCell(cell.id);
          }
        }
      }
    }
  }, [cells])
  
  // Add a new cell
  const addCell = (type: CellType) => {
    const newCell: CellItem = {
      id: Date.now().toString(),
      type,
      content: typeDetail[type].init(cells),
      output: '',
      executionCount: null,
      status: ExecutionStatus.IDLE,
    };
    
    setCells(prevCells => [...prevCells, newCell]);
  };
  
  // Execute code in a cell
  const executeCell = async (id: string) => {
    setCells(prevCells => 
      prevCells.map(cell => 
        cell.id === id 
          ? { ...cell, status: ExecutionStatus.RUNNING } 
          : cell
      )
    );
    
    const cell = cells.find(c => c.id === id);
    if (!cell || typeDetail[cell.type].executable === false) return;
    
    try {
      const result = await execute(cell.type, cell.content);
      setCells(prevCells => 
        prevCells.map(cell => 
          cell.id === id 
            ? { 
                ...cell, 
                output: result, 
                executionCount: nextExecutionCount,
                status: ExecutionStatus.COMPLETED
              } 
            : cell
        )
      );
    } catch (error) {
      setCells(prevCells => 
        prevCells.map(cell => 
          cell.id === id 
            ? { 
                ...cell, 
                output: String(error), 
                executionCount: nextExecutionCount,
                status: ExecutionStatus.ERROR
              } 
            : cell
        )
      );
    }
  };

  // Render a single cell (shared between platform implementations)
  const renderCellContent = useCallback(({item}:{item: CellItem}) => {
    return <Cell
      theme={theme}
      item={item}
      isSelected={selectedCellId === item.id}
      heightRef={heightRef}
      setCells={setCells} 
      executeCell={executeCell} 
      setSelectedCellId={setSelectedCellId}
    />
  }, [selectedCellId, cells]);
  return (
    <SafeAreaView style={styles.container}>
      <SortableList data={cells} setData={_setCells} getId={v=>v.id} renderItem={renderCellContent}/>
      
      <View style={styles.addCellContainer}>
        {Object.entries(typeDetail).map(([k, v], i)=>{
          const buttonStyle:StyleProp<ViewStyle> = {
            backgroundColor: v[theme]
          }
          return <TouchableOpacity
          key={i}
          style={[styles.addCellButton, buttonStyle]}
          onPress={() => addCell(k as CellType)}
        >
          <Icon name={v.iconName} size={v.iconSize} color="#fff" />
          <Text style={styles.addCellButtonText}>{lang(k)}</Text>
        </TouchableOpacity>
        })}
        <TouchableOpacity
          key={'undo'}
          style={[styles.addCellButton, {backgroundColor:'gray'}]}
          onPress={() => undo()}
        >
          <Icon name={'undo'} size={18} color="#fff" />
          <Text style={styles.addCellButtonText}>{lang('undo')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          key={'redo'}
          style={[styles.addCellButton, {backgroundColor:'gray'}]}
          onPress={() => redo()}
        >
          <Icon name={'redo'} size={18} color="#fff" />
          <Text style={styles.addCellButtonText}>{lang('redo')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  addCellContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#888',
    zIndex: -1
  },
  addCellButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    marginHorizontal: 5,
  },
  addCellButtonText: {
    color: '#fff',
    marginLeft: 5,
    fontWeight: '500',
  },
})


export default App;