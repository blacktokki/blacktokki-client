import { StyleSheet } from "react-native";
import { CellType } from "../../types";

// Cell execution status
export enum ExecutionStatus {
    IDLE = 'idle',
    RUNNING = 'running',
    COMPLETED = 'completed',
    ERROR = 'error',
}
  
// Structure for a cell
export interface CellItem {
  id: string;
  type: CellType;
  content: string;
  output: string;
  executionCount: number | null;
  status: ExecutionStatus;
  inputVisible: boolean;
  outputVisible: boolean;
}

export const typeDetail = {
    'EDITOR':{
      executable:false,
      init:(cells:CellItem[])=>'',
      iconName: "edit",
      iconSize: 18,
      light:'goldenrod',
      dark: 'darkgoldenrod'
    },
    'LINK': {
      executable:true,
      init:(cells:CellItem[])=>'https://',
      iconName: 'link',
      iconSize: 20,
      light: '#4CAF50',
      dark: '#2E7D32'// 어두운 녹색
    },
    'MARKDOWN':{
      executable:false,
      init:(cells:CellItem[])=>'# Welcome to Jupyter Notebook in React Native\n\nThis is a basic implementation of Jupyter Notebook using React Native and TypeScript.',
      iconName: 'text-fields',
      iconSize: 20,
      light: '#2196F3',
      dark: '#1565C0'// 어두운 블루
    }
}

export const createUseStyle = <T extends StyleSheet.NamedStyles<T>, >(styles:(theme:'light'|'dark')=>(T | StyleSheet.NamedStyles<T>)) => {
    const _styles = (theme:'light'|'dark') => StyleSheet.create(styles(theme))
    const lightStyles = _styles('light')
    const darkStyles = _styles('dark')
    return (theme:'light'|'dark')=>theme==='dark'?darkStyles:lightStyles
}
