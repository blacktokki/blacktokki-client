// App.tsx
import React, { useState, useCallback, MutableRefObject, useEffect } from 'react';
import { 
  SafeAreaView, 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  Platform,
  StyleProp,
  ViewProps,
} from 'react-native';
// @ts-ignore
import {MaterialIcons as Icon} from 'react-native-vector-icons';
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
    buttonStyleKey: 'markdownButton',
    iconName: "edit",
    iconSize: 18

  },
  'LINK': {
    executable:true,
    init:(cells:Cell[])=>'https://',
    buttonStyleKey: 'codeButton', 
    iconName: 'link',
    iconSize: 20
  },
  'TEMPLATE':{
    executable:true,
    init:(cells:Cell[])=>cells[cells.length-1]?.id || '',
    buttonStyleKey: 'templateButton', 
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
      else if(type==='TEMPLATE'){
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

const App = (props: {init:{type:CellType, content:string, output:string, executionCount:number|null}[], cellRef:MutableRefObject<{cells:Cell[], executeAllCells:()=>Promise<void>}|undefined>}) => {
  const theme = useColorScheme()
  const { lang } = useLangContext()
  const [cells, setCells] = useState<Cell[]>(props.init.map((v, i)=>({...v, id:`${i}` , status: ExecutionStatus.IDLE})));
  
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [nextExecutionCount, setNextExecutionCount] = useState(1);
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
  
  // Delete a cell
  const deleteCell = (id: string) => {
    setCells(prevCells => prevCells.filter(cell => cell.id !== id));
  };

  // Update cell content
  const updateCellContent = (id: string, content: string) => {
    setCells(prevCells => 
      prevCells.map(cell => 
        cell.id === id ? { ...cell, content } : cell
      )
    );
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
    const isSelected = selectedCellId === item.id;
    return (
      <View style={[
        styles.cellContainer,
        isSelected && styles.selectedCell,
        // isDragging && styles.draggingCell
      ]}>
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
          <View style={styles.cellToolbar}>
            <View style={styles.toolbarButton}>
              <Icon
                name={typeDetail[item.type].iconName} 
                size={typeDetail[item.type].iconSize} 
                color="#2196F3" 
              />
            </View>
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
          </View>
          
          {/* Cell input area */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setSelectedCellId(item.id)}
            style={styles.cellInputContainer}
          >
            {item.type === 'EDITOR' ? <View>
              <EditorViewer theme={theme} value={item.content} autoResize active={!isSelected} onPress={()=>setSelectedCellId(item.id)}/>
              <Editor       theme={theme} value={item.content} autoResize active={isSelected} setValue={(text) => updateCellContent(item.id, text)}/>
            </View>
            : (
              <DynamicTextInput
                style={styles.codeInput}
                value={item.content}
                onChangeText={(text) => updateCellContent(item.id, text)}
                autoCapitalize="none"
                autoCorrect={false}
              />
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
  }, [selectedCellId, cells]);
  
  const styles = {...commonStyles, ...theme==='light'?lightStyles:darkStyles}
  return (
    <SafeAreaView style={styles.container}>
      <SortableList data={cells} setData={setCells} getId={v=>v.id} renderItem={renderCellContent}/>
      
      <View style={styles.addCellContainer}>
        {Object.entries(typeDetail).map(([k, v], i)=>{
          const buttonStyle = styles[v.buttonStyleKey as keyof typeof styles] as StyleProp<ViewProps>;
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

const commonStyles = StyleSheet.create({
  headerButtons: {
    flexDirection: 'row',
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
})

// Main application styles
const lightStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: '#3F51B5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    ...(Platform.OS !== 'web' && { elevation: 4 }),
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  headerButtonText: {
    color: '#fff',
    marginLeft: 5,
    fontWeight: '500',
  },
  cellContainer: {
    flexDirection: 'row',
    // marginVertical: 5,
    // borderRadius: 6,
    borderTopLeftRadius:6,
    borderBottomLeftRadius:6,
    backgroundColor: '#f8f8f8',
    overflow: 'hidden',
    // borderWidth: 1,
    borderColor: '#eaeaea',
  },
  selectedCell: {
    borderColor: '#3F51B5',
    borderWidth: 2,
  },
  draggingCell: {
    opacity: 0.7,
    backgroundColor: '#e0e0e0',
  },
  cellHandle: {
    width: 40,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    paddingTop: 15,
  },
  executionCountText: {
    color: '#777',
    fontSize: 12,
  },
  cellContent: {
    flex: 1,
    borderWidth: 1,
    margin:10,
    marginVertical:5,
    borderColor: '#e0e0e0',

  },
  cellToolbar: {
    flexDirection: 'row',
    // backgroundColor: '#f0f0f0',
    padding: 5,
    paddingVertical:0,
    // borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  codeInput: {
    fontFamily: 'monospace',
    minHeight: 40,
    color: '#333',
  },
  markdownInput: {
    minHeight: 40,
    color: '#333',
  },
  outputContainer: {
    backgroundColor: '#f8f8f8',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  errorOutput: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
  },
  outputText: {
    fontFamily: 'monospace',
    color: '#333',
  },
  addCellContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  codeButton: {
    backgroundColor: '#4CAF50',
  },
  markdownButton: {
    backgroundColor: '#2196F3',
  },
  templateButton: {
    backgroundColor: 'lightgoldenrod'
  },
  addCellButtonText: {
    color: '#fff',
    marginLeft: 5,
    fontWeight: '500',
  },
});

const darkStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212', // 다크 모드 배경색
  },
  header: {
    backgroundColor: '#1E1E1E', // 어두운 헤더 배경
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    ...(Platform.OS !== 'web' && { elevation: 4 }),
  },
  title: {
    color: '#E0E0E0', // 연한 회색 텍스트
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // 투명한 어두운 버튼
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  headerButtonText: {
    color: '#B0B0B0', // 회색 텍스트
    marginLeft: 5,
    fontWeight: '500',
  },
  cellContainer: {
    flexDirection: 'row',
    // marginVertical: 5,
    // borderRadius: 6,
    borderTopLeftRadius:6,
    borderBottomLeftRadius:6,
    backgroundColor: '#1E1E1E', // 어두운 셀 배경
    overflow: 'hidden',
    // borderWidth: 1,
    borderColor: '#333333', // 어두운 테두리
  },
  selectedCell: {
    borderColor: '#4A90E2', // 밝은 블루 선택 강조
    borderWidth: 2,
  },
  draggingCell: {
    opacity: 0.7,
    backgroundColor: '#2C2C2C', // 어두운 드래그 색상
  },
  cellHandle: {
    width: 40,
    backgroundColor: '#2A2A2A', // 어두운 핸들 배경
    alignItems: 'center',
    paddingTop: 15,
  },
  executionCountText: {
    color: '#888888', // 어두운 실행 카운트 텍스트
    fontSize: 12,
  },
  cellContent: {
    flex: 1,
    borderWidth: 1,
    margin:10,
    marginVertical:5,
    borderColor: '#3A3A3A',
  },
  cellToolbar: {
    flexDirection: 'row',
    // backgroundColor: '#2A2A2A', // 어두운 툴바 배경
    padding: 5,
    paddingVertical:0,
    // borderBottomWidth: 1,
    borderBottomColor: '#3A3A3A', // 어두운 구분선
  },
  codeInput: {
    fontFamily: 'monospace',
    minHeight: 40,
    color: '#E0E0E0', // 연한 회색 텍스트
    backgroundColor: '#1E1E1E', // 입력 배경
  },
  markdownInput: {
    minHeight: 40,
    color: '#E0E0E0', // 연한 회색 텍스트
    backgroundColor: '#1E1E1E', // 입력 배경
  },
  outputContainer: {
    backgroundColor: '#2A2A2A', // 어두운 출력 배경
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#3A3A3A', // 어두운 구분선
  },
  errorOutput: {
    backgroundColor: 'rgba(244, 67, 54, 0.2)', // 오류 출력 배경 (반투명 레드)
  },
  outputText: {
    fontFamily: 'monospace',
    color: '#B0B0B0', // 회색 텍스트
  },
  addCellContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#333333', // 어두운 구분선
    backgroundColor: '#121212', // 컨테이너 배경
  },
  codeButton: {
    backgroundColor: '#2E7D32', // 어두운 녹색
  },
  markdownButton: {
    backgroundColor: '#1565C0', // 어두운 블루
  },
  templateButton: {
    backgroundColor: 'darkgoldenrod',
  },
  addCellButtonText: {
    color: '#E0E0E0', // 연한 회색 텍스트
    marginLeft: 5,
    fontWeight: '500',
  },
});

export default App;