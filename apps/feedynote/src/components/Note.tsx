// App.tsx
import React, { useState, useCallback, useRef } from 'react';
import { 
  SafeAreaView, 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput,
  ScrollView,
  Platform,
  FlatList,
} from 'react-native';
// @ts-ignore
import {MaterialIcons as Icon} from 'react-native-vector-icons';

// Import platform-specific components
let DraggableFlatList: any;
let ScaleDecorator: any;
let ReactDnd: any;
let DraggableFlatListRenderItemParams: any;

// Handle platform-specific imports
if (Platform.OS === 'android' || Platform.OS === 'ios') {
  // For native platforms, import react-native-draggable-flatlist
  const DraggableImport = require('react-native-draggable-flatlist');
  DraggableFlatList = DraggableImport.default;
  ScaleDecorator = DraggableImport.ScaleDecorator;
  DraggableFlatListRenderItemParams = DraggableImport.RenderItemParams;
} else {
  // For web, import react-dnd
  const DndImport = require('react-dnd');
  const DndHtml5Backend = require('react-dnd-html5-backend');
  ReactDnd = {
    DndProvider: DndImport.DndProvider,
    useDrag: DndImport.useDrag,
    useDrop: DndImport.useDrop,
    HTML5Backend: DndHtml5Backend.HTML5Backend
  };
}

// Cell types as in Jupyter
enum CellType {
  CODE = 'code',
  MARKDOWN = 'markdown',
}

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

// Simple JS execution environment
const executeCode = (code: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      // This is a simple way to evaluate JS code
      // In a real implementation, you'd use a proper JS interpreter
      // or connect to a backend kernel
      const result = eval(`
        try {
          (function() { 
            const console = {
              log: function(...args) {
                return args.map(arg => 
                  typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                ).join(' ');
              }
            };
            return (function() {
              ${code}
            })();
          })();
        } catch(e) {
          "Error: " + e.message;
        }
      `);
      
      resolve(String(result));
    } catch (error) {
      reject(`Error: ${error}`);
    }
  });
};

// For web - Draggable Cell Item Component
const DraggableCellItem = ({ 
  item, 
  index, 
  moveItem, 
  renderCellContent 
}: { 
  item: Cell, 
  index: number, 
  moveItem: (dragIndex: number, hoverIndex: number) => void,
  renderCellContent: (item: Cell, isDragging: boolean) => React.ReactNode
}) => {
  const ref = useRef<HTMLDivElement>(null);
  
  const [{ isDragging }, drag] = ReactDnd.useDrag({
    type: 'CELL',
    item: { index },
    collect: (monitor: any) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = ReactDnd.useDrop({
    accept: 'CELL',
    hover(item: { index: number }, monitor: any) {
      if (!ref.current) {
        return;
      }
      
      const dragIndex = item.index;
      const hoverIndex = index;
      
      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return;
      }
      
      moveItem(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });
  
  drag(drop(ref));
  
  return (
    <div 
      ref={ref} 
      style={{ 
        opacity: isDragging ? 0.5 : 1,
        cursor: 'move',
      }}
    >
      {renderCellContent(item, isDragging)}
    </div>
  );
};

// For web - Sortable List Component
const SortableCellsList = ({ 
  items, 
  onSortEnd, 
  renderCellContent 
}: { 
  items: Cell[], 
  onSortEnd: (items: Cell[]) => void,
  renderCellContent: (item: Cell, isDragging: boolean) => React.ReactNode
}) => {
  const moveItem = (dragIndex: number, hoverIndex: number) => {
    const draggedItem = items[dragIndex];
    const newItems = [...items];
    
    // Remove dragged item from original position
    newItems.splice(dragIndex, 1);
    
    // Insert dragged item at new position
    newItems.splice(hoverIndex, 0, draggedItem);
    
    onSortEnd(newItems);
  };

  return (
    <ReactDnd.DndProvider backend={ReactDnd.HTML5Backend}>
      <View style={styles.cellsList}>
        {items.map((item, index) => (
          <DraggableCellItem
            key={item.id}
            item={item}
            index={index}
            moveItem={moveItem}
            renderCellContent={renderCellContent}
          />
        ))}
      </View>
    </ReactDnd.DndProvider>
  );
};

const App = () => {
  const [cells, setCells] = useState<Cell[]>([
    {
      id: '1',
      type: CellType.MARKDOWN,
      content: '# Welcome to Jupyter Notebook in React Native\n\nThis is a basic implementation of Jupyter Notebook using React Native and TypeScript. You can:\n\n- Write and edit markdown cells\n- Write and execute JavaScript code\n- Reorder cells by dragging them',
      output: '',
      executionCount: null,
      status: ExecutionStatus.IDLE,
    },
    {
      id: '2',
      type: CellType.CODE,
      content: '// Try running this cell\nconst greeting = "Hello, Jupyter!";\nconsole.log(greeting);\n\n// You can also return values\ngreeting.toUpperCase();',
      output: '',
      executionCount: null,
      status: ExecutionStatus.IDLE,
    },
  ]);
  
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [nextExecutionCount, setNextExecutionCount] = useState(1);
  
  // Add a new cell
  const addCell = (type: CellType) => {
    const newCell: Cell = {
      id: Date.now().toString(),
      type,
      content: type === CellType.MARKDOWN ? '*Edit this markdown*' : '// Write your code here',
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
  
  // Change cell type
  const changeCellType = (id: string) => {
    setCells(prevCells => 
      prevCells.map(cell => 
        cell.id === id 
          ? { 
              ...cell, 
              type: cell.type === CellType.CODE ? CellType.MARKDOWN : CellType.CODE,
              output: '',
              executionCount: null,
            } 
          : cell
      )
    );
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
    if (!cell || cell.type !== CellType.CODE) return;
    
    try {
      const result = await executeCode(cell.content);
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
  
  // Execute all cells
  const executeAllCells = async () => {
    for (const cell of cells) {
      if (cell.type === CellType.CODE) {
        await executeCell(cell.id);
      }
    }
  };
  
  // Render a single cell (shared between platform implementations)
  const renderCellContent = useCallback((item: Cell, isDragging: boolean = false) => {
    const isSelected = selectedCellId === item.id;
    
    return (
      <View style={[
        styles.cellContainer,
        isSelected && styles.selectedCell,
        isDragging && styles.draggingCell
      ]}>
        {/* Cell sidebar with execution count and drag handle */}
        <View style={styles.cellHandle}>
          {item.type === CellType.CODE && (
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
            <TouchableOpacity 
              style={styles.toolbarButton}
              onPress={() => executeCell(item.id)}
              disabled={item.type !== CellType.CODE}
            >
              <Icon 
                name="play-arrow" 
                size={20} 
                color={item.type === CellType.CODE ? "#4CAF50" : "#ccc"} 
              />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.toolbarButton}
              onPress={() => changeCellType(item.id)}
            >
              <Icon 
                name={item.type === CellType.CODE ? "code" : "text-fields"} 
                size={20} 
                color="#2196F3" 
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
            {item.type === CellType.MARKDOWN ? (
              isSelected ? (
                <TextInput
                  style={styles.markdownInput}
                  multiline
                  value={item.content}
                  onChangeText={(text) => updateCellContent(item.id, text)}
                  autoFocus
                />
              ) : (
                <Text>
                  {item.content}
                </Text>
              )
            ) : (
              <TextInput
                style={styles.codeInput}
                multiline
                value={item.content}
                onChangeText={(text) => updateCellContent(item.id, text)}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          </TouchableOpacity>
          
          {/* Output area for code cells */}
          {item.type === CellType.CODE && item.output && (
            <View style={[
              styles.outputContainer,
              item.status === ExecutionStatus.ERROR && styles.errorOutput
            ]}>
              <Text style={styles.outputText}>{item.output}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }, [selectedCellId, executeCell, changeCellType, deleteCell, updateCellContent]);
  
  // Render item for native platforms
  const renderCellForNative = useCallback(({ item, drag, isActive }: any) => {
    return (
      <ScaleDecorator>
        <TouchableOpacity onLongPress={drag} activeOpacity={1}>
          {renderCellContent(item, isActive)}
        </TouchableOpacity>
      </ScaleDecorator>
    );
  }, [renderCellContent]);
  
  // Handle cell reordering for native
  const onDragEndNative = useCallback(({ data }: { data: Cell[] }) => {
    setCells(data);
  }, []);
  
  // Handle cell reordering for web
  const onSortEndWeb = useCallback((sortedItems: Cell[]) => {
    setCells(sortedItems);
  }, []);
  
  // Choose the appropriate list component based on platform
  const renderCellList = () => {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      return (
        <DraggableFlatList
          data={cells}
          onDragEnd={onDragEndNative}
          keyExtractor={(item:any) => item.id}
          renderItem={renderCellForNative}
          contentContainerStyle={styles.cellsList}
        />
      );
    } else {
      return (
        <SortableCellsList
          items={cells}
          onSortEnd={onSortEndWeb}
          renderCellContent={renderCellContent}
        />
      );
    }
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Jupyter Notebook</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={executeAllCells}
          >
            <Icon name="play-arrow" size={24} color="#fff" />
            <Text style={styles.headerButtonText}>Run All</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {renderCellList()}
      
      <View style={styles.addCellContainer}>
        <TouchableOpacity 
          style={[styles.addCellButton, styles.codeButton]}
          onPress={() => addCell(CellType.CODE)}
        >
          <Icon name="code" size={20} color="#fff" />
          <Text style={styles.addCellButtonText}>Code</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.addCellButton, styles.markdownButton]}
          onPress={() => addCell(CellType.MARKDOWN)}
        >
          <Icon name="text-fields" size={20} color="#fff" />
          <Text style={styles.addCellButtonText}>Markdown</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// Styles for the Markdown content
const markdownStyles = {
  body: {
    fontSize: 14,
    color: '#333',
  },
  heading1: {
    fontSize: 24,
    marginTop: 10,
    marginBottom: 10,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  heading2: {
    fontSize: 20,
    marginTop: 10,
    marginBottom: 10,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  code_inline: {
    backgroundColor: '#f5f5f5',
    padding: 2,
    borderRadius: 3,
    fontFamily: 'monospace',
  },
  code_block: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 3,
    fontFamily: 'monospace',
  },
};

// Main application styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  headerButtons: {
    flexDirection: 'row',
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
  cellsList: {
    paddingVertical: 10,
    paddingHorizontal: 5,
  },
  cellContainer: {
    flexDirection: 'row',
    marginVertical: 5,
    borderRadius: 6,
    backgroundColor: '#f8f8f8',
    overflow: 'hidden',
    borderWidth: 1,
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
  executionCount: {
    alignItems: 'center',
    marginBottom: 10,
  },
  executionCountText: {
    color: '#777',
    fontSize: 12,
  },
  cellContent: {
    flex: 1,
  },
  cellToolbar: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    padding: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  toolbarButton: {
    padding: 5,
    marginRight: 10,
  },
  cellInputContainer: {
    padding: 10,
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
  addCellButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    marginHorizontal: 5,
  },
  codeButton: {
    backgroundColor: '#4CAF50',
  },
  markdownButton: {
    backgroundColor: '#2196F3',
  },
  addCellButtonText: {
    color: '#fff',
    marginLeft: 5,
    fontWeight: '500',
  },
});

export default App;