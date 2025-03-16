// App.tsx
import React, { useState, useCallback, MutableRefObject, useEffect, useRef } from 'react';
import { 
  SafeAreaView, 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
// @ts-ignore
import {MaterialIcons as Icon} from 'react-native-vector-icons';
import Markdown from 'react-native-markdown-display';
import { useColorScheme, useLangContext } from '@blacktokki/core';
import { Editor, EditorViewer } from '@blacktokki/editor';
import { CellType, Link } from '../../types';
import { previewScrap } from '../../services/feedynote';
import LinkPreview from '../../components/LinkPreview';
import DynamicTextInput from '../../components/DynamicTextInput';
import SortableList from '../../components/DndSortableList';

 
// Cell execution status
enum ExecutionStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ERROR = 'error',
}

// Structure for a cell
interface Cell {
  id: string;
  type: CellType;
  content: string;
  output: string;
  executionCount: number | null;
  status: ExecutionStatus;
}

const typeDetail = {
  'EDITOR':{
    executable:false,
    init:(cells:Cell[])=>'',
    iconName: "edit",
    iconSize: 18

  },
  'LINK': {
    executable:true,
    init:(cells:Cell[])=>'https://',
    iconName: 'link',
    iconSize: 20
  },
  'MARKDOWN':{
    executable:false,
    init:(cells:Cell[])=>'# Welcome to Jupyter Notebook in React Native\n\nThis is a basic implementation of Jupyter Notebook using React Native and TypeScript. You can:\n\n- Write and edit markdown cells\n- Write and execute JavaScript code\n- Reorder cells by dragging them',
    iconName: 'text-fields',
    iconSize: 20
  }
}

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

const CellComponent = ({theme, item, isSelected, heightRef, setCells, executeCell, setSelectedCellId}:{theme:'light'|'dark', item:Cell, isSelected:boolean, heightRef:MutableRefObject<Record<string, number>>, setCells:(func:(cells:Cell[])=>Cell[])=>void, executeCell:(id:string)=>void, setSelectedCellId:(id:string)=>void})=>{
  const {styles, markdownStyles} = useStyles(theme)
  // Update cell content
  const updateCellContent = (id: string, content: string) => {
    setCells(prevCells => 
      prevCells.map(cell => 
        cell.id === id ? { ...cell, content } : cell
      )
    );
  };
  // Delete a cell
  const deleteCell = (id: string) => {
    setCells(prevCells => prevCells.filter(cell => cell.id !== id));
  };
  return (
    <View style={[
      styles.cellContainer,
      {minHeight: heightRef.current[item.id]},
      isSelected && styles.selectedCell,
      // isDragging && styles.draggingCell
    ]}
    onLayout={e=>{heightRef.current[item.id]=e.nativeEvent.layout.height}}
    >
      {/* Cell sidebar with execution count and drag handle */}
      <View style={styles.cellHandle}>
        {typeDetail[item.type].executable && (
          <View style={styles.executionCount}>
            <Text style={styles.executionCountText}>
              {item.executionCount ? `[${item.executionCount}]` : '[ ]'}
            </Text>
          </View>
        )}
        <Icon name="drag-handle" size={20} color="#888" />
      </View>
      
      <View style={styles.cellContent}>
        {/* Cell toolbar */}
        {<View style={styles.cellToolbar}>
        <TouchableOpacity 
            style={styles.toolbarButton}
            onPress={() => setSelectedCellId(item.id)}
          >
            <Icon
              name={typeDetail[item.type].iconName} 
              size={typeDetail[item.type].iconSize} 
              color="#2196F3" 
            />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.toolbarButton}
            onPress={() => executeCell(item.id)}
            disabled={!typeDetail[item.type].executable}
          >
            <Icon 
              name="play-arrow" 
              size={20} 
              color={typeDetail[item.type].executable ? "#4CAF50" : "#ccc"} 
            />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.toolbarButton}
            onPress={() => deleteCell(item.id)}
          >
            <Icon name="delete" size={20} color="#F44336" />
          </TouchableOpacity>
        </View>}
        
        {/* Cell input area */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setSelectedCellId(item.id)}
          style={styles.cellInputContainer}
        >
          {/* EDITOR CELL */}
          {item.type === 'EDITOR' && <View>
            <EditorViewer theme={theme} value={item.content} autoResize active={!isSelected} onPress={()=>setSelectedCellId(item.id)}/>
            <Editor       theme={theme} value={item.content} autoResize active={isSelected} setValue={(text) => updateCellContent(item.id, text)}/>
          </View>}
          {/* LINK CELL */}
          {item.type === 'LINK' && <DynamicTextInput
              style={styles.codeInput}
              value={item.content}
              onChangeText={(text) => updateCellContent(item.id, text)}
              autoCapitalize="none"
              autoCorrect={false}
            />
          }
          {/* MARKDOWN CELL */}
          {item.type === "MARKDOWN" && (
          isSelected ? (
            <DynamicTextInput
              style={styles.markdownInput}
              value={item.content}
              onChangeText={(text) => updateCellContent(item.id, text)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            ) : (
              <Markdown style={markdownStyles}>
                {item.content}
              </Markdown>
            )
          )}
        </TouchableOpacity>
        {/* Output area for code cells */}
        {item.status === ExecutionStatus.COMPLETED  ? <>
            {typeDetail[item.type].executable && (JSON.parse(item.output) as Link[]).map((link, i)=><LinkPreview key={i} link={link} isMobile={false} />)}
          </>:
          item.status === ExecutionStatus.ERROR && <View style={[styles.outputContainer, styles.errorOutput]}>
            <Text style={styles.outputText}>{item.output}</Text>
          </View>}
      </View>
    </View>
  );
}

const App = (props: {init:{type:CellType, content:string, output:string, executionCount:number|null, status?:string}[], cellRef:MutableRefObject<{cells:Cell[], executeAllCells:()=>Promise<void>}|undefined>}) => {
  const theme = useColorScheme()
  const { lang } = useLangContext()
  const [cells, setCells] = useState<Cell[]>(props.init.map((v, i)=>({...v, id:`${i}` , status:v.status as ExecutionStatus || ExecutionStatus.IDLE})));
  
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [nextExecutionCount, setNextExecutionCount] = useState(1);
  const heightRef = useRef<Record<string, number>>({})
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
    const newCell: Cell = {
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
  const renderCellContent = useCallback(({item}:{item: Cell}) => {
    return <CellComponent 
      theme={theme}
      item={item}
      isSelected={selectedCellId === item.id}
      heightRef={heightRef}
      setCells={setCells} 
      executeCell={executeCell} 
      setSelectedCellId={setSelectedCellId}
    />
  }, [selectedCellId, cells]);
  
  const { styles } = useStyles(theme)
  return (
    <SafeAreaView style={styles.container}>
      <SortableList data={cells} setData={setCells} getId={v=>v.id} renderItem={renderCellContent}/>
      
      <View style={styles.addCellContainer}>
        {Object.entries(typeDetail).map(([k, v], i)=>{
          const buttonStyle:StyleProp<ViewStyle> = {
            backgroundColor: Colors[theme][k as keyof typeof Colors['light'|'dark']]
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

const Colors = {
  light:{
    background: '#f8f8f8',
    text: '#111',
    codeText: '#333',
    codeBackground: '#f8f8f8',
    outerBackground: '#fff',
    border: '#e0e0e0',
    selectedBorder: '#3F51B5',
    error:  'rgba(244, 67, 54, 0.1)',
    markdownHead: '#2C3E50',
    markdownCode: '#f5f5f5',
    LINK: '#4CAF50',
    MARKDOWN:'#2196F3',
    EDITOR: 'goldenrod',
  },
  dark:{
    background:'#1E1E1E',  // 어두운 헤더 배경
    text: '#E0E0E0',  // 연한 회색 텍스트
    codeText: '#B0B0B0',// 회색 텍스트
    codeBackground: '#2A2A2A',  // 어두운 출력 배경
    outerBackground: '#121212', // 다크 모드 배경색
    border: '3A3A3A',  // 어두운 구분선
    selectedBorder: '#4A90E2', // 밝은 블루 선택 강조
    error:  'rgba(244, 67, 54, 0.2)', // 오류 출력 배경 (반투명 레드)
    markdownHead: '#A0B9D0',
    markdownCode: '#1E1E1E',
    LINK: '#2E7D32', // 어두운 녹색
    MARKDOWN:'#1565C0', // 어두운 블루
    EDITOR: 'darkgoldenrod',
  }
}

const _styles = (theme:'light'|'dark') => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].outerBackground,
    },
    header: {
      backgroundColor: Colors[theme].background,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 15,
      ...(Platform.OS !== 'web' && { elevation: 4 }),
    },
    title: {
      color: Colors[theme].text,
      fontSize: 20,
      fontWeight: 'bold',
    },
    headerButtonText: {
      color: Colors[theme].codeText,
      marginLeft: 5,
      fontWeight: '500',
    },
    cellContainer: {
      flexDirection: 'row',
      borderTopLeftRadius: 6,
      borderBottomLeftRadius: 6,
      backgroundColor: Colors[theme].background,
      overflow: 'hidden',
      borderColor: Colors[theme].border,
      padding:1,
    },
    selectedCell: {
      borderColor: Colors[theme].selectedBorder,
      borderWidth: 2,
      padding:0,
    },
    draggingCell: {
      opacity: 0.7,
      backgroundColor: Colors[theme].background,
    },
    cellHandle: {
      width: 40,
      backgroundColor: Colors[theme].codeBackground,
      alignItems: 'center',
      paddingTop: 15,
    },
    cellContent: {
      flex: 1,
      borderWidth: 1,
      margin: 10,
      marginVertical: 5,
      borderColor: Colors[theme].border,
    },
    cellToolbar: {
      flexDirection: 'row',
      padding: 5,
      paddingVertical: 0,
      borderBottomColor: Colors[theme].border,
    },
    codeInput: {
      fontFamily: 'monospace',
      minHeight: 40,
      color: Colors[theme].text,
      backgroundColor: Colors[theme].background,
    },
    markdownInput: {
      minHeight: 40,
      color: Colors[theme].text,
      backgroundColor: Colors[theme].background,
    },
    outputContainer: {
      backgroundColor: Colors[theme].codeBackground,
      padding: 10,
      borderTopWidth: 1,
      borderTopColor: Colors[theme].border,
    },
    errorOutput: {
      backgroundColor: Colors[theme].error,
    },
    outputText: {
      fontFamily: 'monospace',
      color: Colors[theme].codeText,
    },
    addCellContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      padding: 15,
      borderTopWidth: 1,
      borderTopColor: Colors[theme].border,
      backgroundColor: Colors[theme].outerBackground,
      zIndex: -1
    },
    // common styles
    headerButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 4,
    },
    executionCount: {
      alignItems: 'center',
      marginBottom: 10,
    },
    toolbarButton: {
      padding: 5,
      marginRight: 10,
    },
    cellInputContainer: {
      //padding: 10,
      padding:0,
      paddingHorizontal:5,
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
    executionCountText: {
      color: '#888',
      fontSize: 12,
    },
  });
  const markdownStyles = {
    body: {
      fontSize: 14,
      color: Colors[theme].codeText,
    },
    heading1: {
      fontSize: 24,
      marginTop: 10,
      marginBottom: 10,
      fontWeight: 'bold',
      color: Colors[theme].markdownHead
    },
    heading2: {
      fontSize: 20,
      marginTop: 10,
      marginBottom: 10,
      fontWeight: 'bold',
      color: Colors[theme].markdownHead
    },
    code_inline: {
      backgroundColor: Colors[theme].markdownCode,
      padding: 2,
      borderRadius: 3,
      fontFamily: 'monospace',
    },
    code_block: {
      backgroundColor: Colors[theme].markdownCode,
      padding: 10,
      borderRadius: 3,
      fontFamily: 'monospace',
    },
  }
  return {styles , markdownStyles}
}

const lightStyles = _styles('light')
const darkStyles = _styles('dark')
const useStyles = (theme:'light'|'dark') => theme === 'light'?lightStyles:darkStyles


export default App;