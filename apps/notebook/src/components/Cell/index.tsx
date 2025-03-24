// App.tsx
import React, { MutableRefObject } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity,
  Platform, 
} from 'react-native';
// @ts-ignore
import {MaterialIcons as Icon} from 'react-native-vector-icons';
import Markdown from 'react-native-markdown-display';
import { Editor, EditorViewer } from '@blacktokki/editor';
import { Link } from '../../types';
import LinkPreview from '../LinkPreview';
import DynamicTextInput from '../DynamicTextInput';
import { CellItem, ExecutionStatus, createUseStyle, typeDetail} from './common';

export { ExecutionStatus, typeDetail } from './common';
export type { CellItem } from './common';
export default React.memo(({theme, item, isSelected, heightRef, setCells, executeCell, setSelectedCellId}:{theme:'light'|'dark', item:CellItem, isSelected:boolean, heightRef:MutableRefObject<Record<string, number>>, setCells:(func:(cells:CellItem[])=>CellItem[])=>void, executeCell:(id:string)=>void, setSelectedCellId:(id:string)=>void})=>{
  const styles = useStyles(theme)
  const markdownStyles = useMarkdownStyles(theme)
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

  // Toggle input visibility
  const toggleInputVisibility = (id: string) => {
    setCells(prevCells => 
      prevCells.map(cell => 
        cell.id === id ? { ...cell, inputVisible: !cell.inputVisible } : cell
      )
    );
  };
  
  // Toggle output visibility
  const toggleOutputVisibility = (id: string) => {
    setCells(prevCells => 
      prevCells.map(cell => 
        cell.id === id ? { ...cell, outputVisible: !cell.outputVisible } : cell
      )
    );
  };

  return (
    <View style={[
      styles.cellContainer,
      item.inputVisible && item.type==='EDITOR' && {minHeight: heightRef.current[item.id]},
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
        {/* New toggle button for input */}
        <TouchableOpacity 
          style={styles.visibleToggle}
          onPress={() => toggleInputVisibility(item.id)}
        />
        <View style={{flex:1, paddingHorizontal:5}}>
          {/* SUMMARY CELL */}
          {!item.inputVisible && <TouchableOpacity style={styles.summaryButton} onPress={() => toggleInputVisibility(item.id)}>
            <Text style={styles.summaryText}>● ● ●</Text>
          </TouchableOpacity>}
          {/* EDITOR CELL */}
          {<View style={{display:item.inputVisible && item.type === 'EDITOR'?'flex':'none'}}>
            <EditorViewer theme={theme} value={item.content} autoResize active={!isSelected} onPress={()=>setSelectedCellId(item.id)}/>
            <Editor       theme={theme} value={item.content} autoResize active={isSelected} setValue={item.type === 'EDITOR'?(text) => updateCellContent(item.id, text):()=>{}}/>
          </View>}
          {/* LINK CELL */}
          {item.inputVisible && item.type === 'LINK' && <DynamicTextInput
              style={styles.codeInput}
              value={item.content}
              onChangeText={(text) => updateCellContent(item.id, text)}
              autoCapitalize="none"
              autoCorrect={false}
            />
          }
          {/* MARKDOWN CELL */}
          {item.inputVisible && item.type === "MARKDOWN" && (
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
        </View>
        </TouchableOpacity>
        {/* Output area for code cells */}
        {<View style={{flexDirection:'row'}}> 
          <TouchableOpacity 
            style={styles.visibleToggle}
            onPress={() => toggleOutputVisibility(item.id)}
          />
          {!item.outputVisible ? (item.inputVisible && <TouchableOpacity style={styles.summaryButton} onPress={() => toggleOutputVisibility(item.id)}>
            <Text style={styles.summaryText}>● ● ●</Text>
          </TouchableOpacity>):
          <View style={{flex:1}}>
            {item.status === ExecutionStatus.COMPLETED  ? <>
              {typeDetail[item.type].executable && (JSON.parse(item.output) as Link[]).map((link, i)=><LinkPreview key={i} link={link} isMobile={false} />)}
            </>:
            item.status === ExecutionStatus.ERROR && <View style={[styles.outputContainer, styles.errorOutput]}>
              <Text style={styles.outputText}>{item.output}</Text>
            </View>}
          </View>}
        </View>}
      </View>
    </View>
  );
})

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
    }
}

const useStyles = createUseStyle((theme)=>({
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
      padding: 10,
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
      flexDirection:'row',
      padding:0,
      // paddingHorizontal:5,
    },
    executionCountText: {
      color: '#888',
      fontSize: 12,
    },
    visibleToggle: {
      width:10, 
      height:'100%', 
      backgroundColor:'#2196F3',
      borderRadius:5
    },
    summaryButton: {
      padding:10, 
      width:'100%'
    },
    summaryText: {
      minHeight: 20,
      color: 'gray',
      backgroundColor: Colors[theme].background,
      fontSize:10
    },
}))

const useMarkdownStyles = createUseStyle((theme)=>({
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
}))