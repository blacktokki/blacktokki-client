// App.tsx
import React, { useState, useCallback, MutableRefObject, useEffect, useRef } from 'react';
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
import { previewScrap } from '../../services/feedynote';
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

const App = (props: {init:{type:CellType, content:string, output:string, executionCount:number|null, status?:string}[], cellRef:MutableRefObject<{cells:CellItem[], executeAllCells:()=>Promise<void>}|undefined>}) => {
  const theme = useColorScheme()
  const { lang } = useLangContext()
  const [cells, setCells] = useState<CellItem[]>([]);
  
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [nextExecutionCount, setNextExecutionCount] = useState(1);
  const heightRef = useRef<Record<string, number>>({})
  useEffect(()=>{
    setCells(props.init.map((v, i)=>({...v, id:`${i}` , status:v.status as ExecutionStatus || ExecutionStatus.IDLE})))
    setSelectedCellId(null)
  }, [props.init])
  useEffect(()=>{
    props.cellRef.current = {
      cells:cells,
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
      setNextExecutionCount(prev => prev + 1);
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
      setNextExecutionCount(prev => prev + 1);
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
      <SortableList data={cells} setData={setCells} getId={v=>v.id} renderItem={renderCellContent}/>
      
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