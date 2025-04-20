import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  FlatList,
  Modal,
  SafeAreaView,
  Platform,
} from 'react-native';
//@ts-ignore
import Icon from 'react-native-vector-icons/MaterialIcons';

// Custom hook for color scheme (provided externally)
const useColorScheme = () => 'light' as 'light' | 'dark';

// Types
type FileSystemItem = {
  kind: 'file' | 'directory';
  name: string;
  handle: FileSystemHandle;
  path: string;
  children?: FileSystemItem[];
  isExpanded?: boolean;
  parent?: FileSystemItem;
  content?: string;
  size?: number;
  lastModified?: number;
};

type FileSystemHandle = FileSystemFileHandle | FileSystemDirectoryHandle;

type OpenTabType = {
  file: FileSystemItem;
  isActive: boolean;
};

type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
};

type SearchResult = {
  file: FileSystemItem;
  matches: {
    line: number;
    lineContent: string;
    index: number;
    length: number;
  }[];
};

const App: React.FC = () => {
  const theme = useColorScheme();
  const [rootDirectory, setRootDirectory] = useState<FileSystemItem | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [flatFileList, setFlatFileList] = useState<FileSystemItem[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTabType[]>([]);
  const [activeFile, setActiveFile] = useState<FileSystemItem | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [textareaKey, setTextareaKey] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
  });
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Helper to recursively flatten the file structure
  const flattenFileStructure = useCallback((item: FileSystemItem, result: FileSystemItem[] = []): FileSystemItem[] => {
    result.push(item);
    if (item.children && item.isExpanded) {
      item.children.forEach(child => flattenFileStructure(child, result));
    }
    return result;
  }, []);

  // Update the flat file list whenever the root directory or expanded items change
  useEffect(() => {
    if (rootDirectory) {
      const flatList = flattenFileStructure(rootDirectory);
      setFlatFileList(flatList);
    } else {
      setFlatFileList([]);
    }
  }, [rootDirectory, expandedItems, flattenFileStructure]);

  // Read a file's content
  const readFileContent = async (file: FileSystemItem) => {
    if (file.kind === 'file') {
      try {
        const fileHandle = file.handle as FileSystemFileHandle;
        const fileObj = await fileHandle.getFile();
        
        // Check if file is binary (this is a simple check, could be improved)
        const isBinary = /\.(png|jpg|jpeg|gif|webp|pdf|doc|docx|xls|xlsx|zip|rar|exe|dll|so|o|bin)$/i.test(file.name);
        
        if (isBinary) {
          return `[Binary file: ${file.name}]`;
        }
        
        const text = await fileObj.text();
        return text;
      } catch (error) {
        console.error('Error reading file:', error);
        return `Error reading file: ${error}`;
      }
    }
    return '';
  };

  // Open a file
  const openFile = async (file: FileSystemItem) => {
    if (file.kind !== 'file') return;

    // Check if file is already open
    const isAlreadyOpen = openTabs.some(tab => tab.file.path === file.path);
    
    // Update active tab or create new tab
    if (isAlreadyOpen) {
      setOpenTabs(prev => prev.map(tab => ({
        ...tab,
        isActive: tab.file.path === file.path
      })));
    } else {
      const content = await readFileContent(file);
      file.content = content;
      setOpenTabs(prev => [
        ...prev.map(tab => ({ ...tab, isActive: false })),
        { file, isActive: true }
      ]);
    }

    // Set active file
    setActiveFile(file);
    
    // Update content in textarea
    if (file.content) {
      setFileContent(file.content);
    } else {
      const content = await readFileContent(file);
      file.content = content;
      setFileContent(content);
    }
    
    // Reset textarea (force re-render)
    setTextareaKey(prev => prev + 1);
  };

  // Switch to another tab
  const switchTab = (tabIndex: number) => {
    const updatedTabs = openTabs.map((tab, idx) => ({
      ...tab,
      isActive: idx === tabIndex
    }));
    
    setOpenTabs(updatedTabs);
    const activeTab = updatedTabs[tabIndex];
    setActiveFile(activeTab.file);
    setFileContent(activeTab.file.content || '');
    setTextareaKey(prev => prev + 1);
  };

  // Close a tab
  const closeTab = (tabIndex: number, event: React.MouseEvent) => {
    event.stopPropagation();
    
    const tab = openTabs[tabIndex];
    const newTabs = openTabs.filter((_, idx) => idx !== tabIndex);
    
    // If we're closing the active tab
    if (tab.isActive && newTabs.length > 0) {
      // Activate the next tab, or the previous if we're closing the last one
      const newActiveIndex = tabIndex < newTabs.length ? tabIndex : newTabs.length - 1;
      newTabs[newActiveIndex].isActive = true;
      setActiveFile(newTabs[newActiveIndex].file);
      setFileContent(newTabs[newActiveIndex].file.content || '');
      setTextareaKey(prev => prev + 1);
    } else if (newTabs.length === 0) {
      // No tabs left
      setActiveFile(null);
      setFileContent('');
    }
    
    setOpenTabs(newTabs);
  };

  // Handle file content change
  const handleFileContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setFileContent(newContent);
    
    // Update the content in file object and tab
    if (activeFile) {
      activeFile.content = newContent;
      
      // Update in tabs as well
      setOpenTabs(prev => prev.map(tab => 
        tab.file.path === activeFile.path 
          ? { ...tab, file: { ...tab.file, content: newContent } } 
          : tab
      ));
    }
  };

  // Save current file
  const saveFile = async () => {
    if (!activeFile || activeFile.kind !== 'file') return;
    
    try {
      const fileHandle = activeFile.handle as FileSystemFileHandle;
      const writable = await fileHandle.createWritable();
      await writable.write(fileContent);
      await writable.close();
      console.log('File saved successfully');
    } catch (error) {
      console.error('Error saving file:', error);
    }
  };

  // Toggle directory expansion
  const toggleDirectory = async (directory: FileSystemItem) => {
    if (directory.kind !== 'directory') return;
    
    const path = directory.path;
    const isExpanded = expandedItems.has(path);
    
    // Toggle expanded state
    const newExpandedItems = new Set(expandedItems);
    if (isExpanded) {
      newExpandedItems.delete(path);
    } else {
      newExpandedItems.add(path);
      
      // Load children if not loaded yet
      if (!directory.children || directory.children.length === 0) {
        await loadDirectoryContents(directory);
      }
    }
    
    directory.isExpanded = !isExpanded;
    setExpandedItems(newExpandedItems);
  };

  // Load directory contents
  const loadDirectoryContents = async (directory: FileSystemItem) => {
    if (directory.kind !== 'directory') return;
    
    try {
      const dirHandle = directory.handle as FileSystemDirectoryHandle;
      const children: FileSystemItem[] = [];
      
      //@ts-ignore
      for await (const entry of dirHandle.values()) {
        const childPath = `${directory.path}/${entry.name}`;
        const childItem: FileSystemItem = {
          kind: entry.kind,
          name: entry.name,
          handle: entry,
          path: childPath,
          isExpanded: false,
          parent: directory,
          children: entry.kind === 'directory' ? [] : undefined,
        };
        children.push(childItem);
      }
      
      // Sort: directories first, then files alphabetically
      children.sort((a, b) => {
        if (a.kind === b.kind) {
          return a.name.localeCompare(b.name);
        }
        return a.kind === 'directory' ? -1 : 1;
      });
      
      directory.children = children;
      
      // Force update of the component
      setRootDirectory(prev => prev ? { ...prev } : null);
    } catch (error) {
      console.error('Error loading directory contents:', error);
    }
  };

  // Open directory using File System Access API
  const openDirectory = async () => {
    try {
      // Check if the API is available
      if (!('showDirectoryPicker' in window)) {
        alert('File System Access API is not supported in this browser');
        return;
      }
      
      // @ts-ignore - TypeScript doesn't have proper types for this API yet
      const dirHandle = await window.showDirectoryPicker();
      
      // Create root directory item
      const rootItem: FileSystemItem = {
        kind: 'directory',
        name: dirHandle.name,
        handle: dirHandle,
        path: dirHandle.name,
        isExpanded: true,
        children: [],
      };
      
      // Load initial contents
      await loadDirectoryContents(rootItem);
      
      // Set as root directory and expand it
      setRootDirectory(rootItem);
      const newExpandedItems = new Set<string>();
      newExpandedItems.add(rootItem.path);
      setExpandedItems(newExpandedItems);
      
      // Reset open tabs and active file
      setOpenTabs([]);
      setActiveFile(null);
      setFileContent('');
      setSearchResults([]);
    } catch (error) {
      console.error('Error opening directory:', error);
      if (error instanceof DOMException && error.name === 'AbortError') {
        // User cancelled the picker
        return;
      }
      alert(`Error opening directory: ${error}`);
    }
  };

  // Search through files
  const searchInFiles = useCallback(async () => {
    if (!rootDirectory || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    
    try {
      const results: SearchResult[] = [];
      const filesToSearch: FileSystemItem[] = [];
      
      // Helper function to collect all files recursively
      const collectFiles = (item: FileSystemItem) => {
        if (item.kind === 'file') {
          filesToSearch.push(item);
        } else if (item.children) {
          item.children.forEach(collectFiles);
        }
      };
      
      collectFiles(rootDirectory);
      
      // Process each file
      for (const file of filesToSearch) {
        // Skip binary files
        if (/\.(png|jpg|jpeg|gif|webp|pdf|doc|docx|xls|xlsx|zip|rar|exe|dll|so|o|bin)$/i.test(file.name)) {
          continue;
        }
        
        // Read content if not already loaded
        if (!file.content) {
          file.content = await readFileContent(file);
        }
        
        if (!file.content) continue;
        
        const matches = findMatches(file.content, searchQuery, searchOptions);
        
        if (matches.length > 0) {
          results.push({
            file,
            matches,
          });
        }
      }
      
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching in files:', error);
    } finally {
      setIsSearching(false);
    }
  }, [rootDirectory, searchQuery, searchOptions]);

  // Helper function to find matches in text
  const findMatches = (text: string, query: string, options: SearchOptions) => {
    const matches: {
      line: number;
      lineContent: string;
      index: number;
      length: number;
    }[] = [];
    
    try {
      // Prepare search pattern
      let pattern: RegExp;
      
      if (options.useRegex) {
        pattern = new RegExp(
          query,
          options.caseSensitive ? 'g' : 'gi'
        );
      } else {
        let escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        if (options.wholeWord) {
          escapedQuery = `\\b${escapedQuery}\\b`;
        }
        
        pattern = new RegExp(
          escapedQuery,
          options.caseSensitive ? 'g' : 'gi'
        );
      }
      
      // Split text into lines
      const lines = text.split('\n');
      
      // Search each line
      lines.forEach((lineContent, lineIndex) => {
        let match;
        while ((match = pattern.exec(lineContent)) !== null) {
          matches.push({
            line: lineIndex + 1,
            lineContent,
            index: match.index,
            length: match[0].length,
          });
        }
      });
    } catch (error) {
      console.error('Error in search pattern:', error);
    }
    
    return matches;
  };

  // Replace text in active file
  const replaceInFile = () => {
    if (!activeFile || !activeFile.content || !searchQuery) return;
    
    try {
      let newContent = activeFile.content;
      
      if (searchOptions.useRegex) {
        const pattern = new RegExp(
          searchQuery,
          searchOptions.caseSensitive ? 'g' : 'gi'
        );
        newContent = newContent.replace(pattern, replaceQuery);
      } else {
        let escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        if (searchOptions.wholeWord) {
          const pattern = new RegExp(
            `\\b${escapedQuery}\\b`,
            searchOptions.caseSensitive ? 'g' : 'gi'
          );
          newContent = newContent.replace(pattern, replaceQuery);
        } else {
          const pattern = new RegExp(
            escapedQuery,
            searchOptions.caseSensitive ? 'g' : 'gi'
          );
          newContent = newContent.replace(pattern, replaceQuery);
        }
      }
      
      // Update content
      activeFile.content = newContent;
      setFileContent(newContent);
      
      // Update in tabs
      setOpenTabs(prev => prev.map(tab => 
        tab.file.path === activeFile.path 
          ? { ...tab, file: { ...tab.file, content: newContent } } 
          : tab
      ));
      
      // Force textarea update
      setTextareaKey(prev => prev + 1);
      
      // Update search results
      searchInFiles();
    } catch (error) {
      console.error('Error in replace operation:', error);
    }
  };

  // Replace all occurrences in all files
  const replaceAllInFiles = async () => {
    if (!searchResults.length || !searchQuery || !replaceQuery) return;
    
    try {
      // Process each file with matches
      for (const result of searchResults) {
        const file = result.file;
        
        // Read content if not already loaded
        if (!file.content) {
          file.content = await readFileContent(file);
        }
        
        if (!file.content) continue;
        
        let newContent = file.content;
        
        if (searchOptions.useRegex) {
          const pattern = new RegExp(
            searchQuery,
            searchOptions.caseSensitive ? 'g' : 'gi'
          );
          newContent = newContent.replace(pattern, replaceQuery);
        } else {
          let escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          if (searchOptions.wholeWord) {
            const pattern = new RegExp(
              `\\b${escapedQuery}\\b`,
              searchOptions.caseSensitive ? 'g' : 'gi'
            );
            newContent = newContent.replace(pattern, replaceQuery);
          } else {
            const pattern = new RegExp(
              escapedQuery,
              searchOptions.caseSensitive ? 'g' : 'gi'
            );
            newContent = newContent.replace(pattern, replaceQuery);
          }
        }
        
        // Update content
        file.content = newContent;
        
        // If this is the active file, update UI
        if (activeFile && file.path === activeFile.path) {
          setFileContent(newContent);
          setTextareaKey(prev => prev + 1);
        }
        
        // Update in tabs
        setOpenTabs(prev => prev.map(tab => 
          tab.file.path === file.path 
            ? { ...tab, file: { ...tab.file, content: newContent } } 
            : tab
        ));
        
        // Save the file
        try {
          const fileHandle = file.handle as FileSystemFileHandle;
          const writable = await fileHandle.createWritable();
          await writable.write(newContent);
          await writable.close();
        } catch (error) {
          console.error(`Error saving file ${file.name}:`, error);
        }
      }
      
      // Update search results
      searchInFiles();
    } catch (error) {
      console.error('Error in replace all operation:', error);
    }
  };

  // Trigger search when query or options change
  useEffect(() => {
    if (searchQuery) {
      const delaySearch = setTimeout(() => {
        searchInFiles();
      }, 300);
      
      return () => clearTimeout(delaySearch);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, searchOptions, searchInFiles]);

  // File icon based on file extension
  const getFileIcon = (file: FileSystemItem) => {
    if (file.kind === 'directory') {
      return file.isExpanded ? 'folder-open' : 'folder';
    }
    
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
        return 'code';
      case 'html':
      case 'xml':
      case 'svg':
        return 'html';
      case 'css':
      case 'scss':
      case 'less':
        return 'style';
      case 'json':
        return 'data-object';
      case 'md':
        return 'description';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
        return 'image';
      case 'pdf':
        return 'picture-as-pdf';
      default:
        return 'insert-drive-file';
    }
  };

  // Render file tree item
  const renderFileItem = ({ item }: { item: FileSystemItem }) => {
    const paddingLeft = item.path.split('/').length * 15;
    const iconName = getFileIcon(item);
    
    return (
      <TouchableOpacity
        style={[
          styles.fileItem,
          { paddingLeft },
          activeFile?.path === item.path && styles.activeFileItem
        ]}
        onPress={() => item.kind === 'directory' ? toggleDirectory(item) : openFile(item)}
      >
        <Icon name={iconName} size={18} color={theme === 'dark' ? '#ccc' : '#333'} style={styles.fileIcon} />
        <Text style={[
          styles.fileName,
          theme === 'dark' ? styles.textDark : styles.textLight
        ]}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  // Generate line numbers for current file
  const renderLineNumbers = () => {
    if (!fileContent) return null;
    
    const lineCount = fileContent.split('\n').length;
    const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);
    
    return (
      <View style={styles.lineNumbers}>
        {lineNumbers.map(num => (
          <Text 
            key={num} 
            style={[
              styles.lineNumber,
              theme === 'dark' ? styles.textDark : styles.textLight
            ]}
          >
            {num}
          </Text>
        ))}
      </View>
    );
  };

  // UI for the app
  return (
    <SafeAreaView style={[
      styles.container,
      theme === 'dark' ? styles.containerDark : styles.containerLight
    ]}>
      {/* Header */}
      <View style={[
        styles.header,
        theme === 'dark' ? styles.headerDark : styles.headerLight
      ]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={openDirectory}
        >
          <Icon name="folder-open" size={20} color={theme === 'dark' ? '#fff' : '#333'} />
          <Text style={theme === 'dark' ? styles.textDark : styles.textLight}>Open Folder</Text>
        </TouchableOpacity>
        
        {activeFile && (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={saveFile}
          >
            <Icon name="save" size={20} color={theme === 'dark' ? '#fff' : '#333'} />
            <Text style={theme === 'dark' ? styles.textDark : styles.textLight}>Save</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setIsSearchOpen(!isSearchOpen)}
        >
          <Icon name="search" size={20} color={theme === 'dark' ? '#fff' : '#333'} />
          <Text style={theme === 'dark' ? styles.textDark : styles.textLight}>
            {isSearchOpen ? 'Hide Search' : 'Find & Replace'}
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* Main content */}
      <View style={styles.content}>
        {/* File explorer (left sidebar) */}
        <View style={[
          styles.sidebar,
          theme === 'dark' ? styles.sidebarDark : styles.sidebarLight
        ]}>
          {/* Directory header */}
          <View style={styles.sidebarHeader}>
            <Text style={[
              styles.sidebarTitle,
              theme === 'dark' ? styles.textDark : styles.textLight
            ]}>
              Explorer {rootDirectory ? `- ${rootDirectory.name}` : ''}
            </Text>
          </View>
          
          {/* File tree */}
          {rootDirectory ? (
            <FlatList
              data={flatFileList}
              renderItem={renderFileItem}
              keyExtractor={item => item.path}
              style={styles.fileTree}
            />
          ) : (
            <View style={styles.emptyState}>
              <Icon name="folder" size={40} color={theme === 'dark' ? '#555' : '#ccc'} />
              <Text style={[
                styles.emptyStateText,
                theme === 'dark' ? styles.textDark : styles.textLight
              ]}>
                No folder open
              </Text>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={openDirectory}
              >
                <Text style={styles.emptyStateButtonText}>Open Folder</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {/* Search panel */}
          {isSearchOpen && (
            <View style={[
              styles.searchPanel,
              theme === 'dark' ? styles.searchPanelDark : styles.searchPanelLight
            ]}>
              <Text style={[
                styles.searchTitle,
                theme === 'dark' ? styles.textDark : styles.textLight
              ]}>
                Find & Replace
              </Text>
              
              {/* Search query */}
              <View style={styles.searchInputWrapper}>
                <Icon name="search" size={16} color={theme === 'dark' ? '#aaa' : '#666'} />
                <TextInput
                  style={[
                    styles.searchInput,
                    theme === 'dark' ? styles.inputDark : styles.inputLight
                  ]}
                  placeholder="Find..."
                  placeholderTextColor={theme === 'dark' ? '#777' : '#aaa'}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              
              {/* Replace query */}
              <View style={styles.searchInputWrapper}>
                <Icon name="find-replace" size={16} color={theme === 'dark' ? '#aaa' : '#666'} />
                <TextInput
                  style={[
                    styles.searchInput,
                    theme === 'dark' ? styles.inputDark : styles.inputLight
                  ]}
                  placeholder="Replace with..."
                  placeholderTextColor={theme === 'dark' ? '#777' : '#aaa'}
                  value={replaceQuery}
                  onChangeText={setReplaceQuery}
                />
              </View>
              
              {/* Search options */}
              <View style={styles.searchOptions}>
                <TouchableOpacity
                  style={styles.searchOption}
                  onPress={() => setSearchOptions(prev => ({ ...prev, caseSensitive: !prev.caseSensitive }))}
                >
                  <Icon
                    name={searchOptions.caseSensitive ? 'check-box' : 'check-box-outline-blank'}
                    size={18}
                    color={theme === 'dark' ? '#aaa' : '#666'}
                  />
                  <Text style={[
                    styles.searchOptionText,
                    theme === 'dark' ? styles.textDark : styles.textLight
                  ]}>
                    Case sensitive
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.searchOption}
                  onPress={() => setSearchOptions(prev => ({ ...prev, wholeWord: !prev.wholeWord }))}
                >
                  <Icon
                    name={searchOptions.wholeWord ? 'check-box' : 'check-box-outline-blank'}
                    size={18}
                    color={theme === 'dark' ? '#aaa' : '#666'}
                  />
                  <Text style={[
                    styles.searchOptionText,
                    theme === 'dark' ? styles.textDark : styles.textLight
                  ]}>
                    Whole word
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.searchOption}
                  onPress={() => setSearchOptions(prev => ({ ...prev, useRegex: !prev.useRegex }))}
                >
                  <Icon
                    name={searchOptions.useRegex ? 'check-box' : 'check-box-outline-blank'}
                    size={18}
                    color={theme === 'dark' ? '#aaa' : '#666'}
                  />
                  <Text style={[
                    styles.searchOptionText,
                    theme === 'dark' ? styles.textDark : styles.textLight
                  ]}>
                    Use regex
                  </Text>
                </TouchableOpacity>
              </View>
              
              {/* Search actions */}
              <View style={styles.searchActions}>
                <TouchableOpacity
                  style={[
                    styles.searchButton,
                    theme === 'dark' ? styles.buttonDark : styles.buttonLight
                  ]}
                  onPress={searchInFiles}
                  disabled={isSearching || !searchQuery}
                >
                  <Text style={styles.buttonText}>
                    {isSearching ? 'Searching...' : 'Find All'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.searchButton,
                    theme === 'dark' ? styles.buttonDark : styles.buttonLight
                  ]}
                  onPress={replaceInFile}
                  disabled={!activeFile || !searchQuery}
                >
                  <Text style={styles.buttonText}>Replace</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.searchButton,
                    theme === 'dark' ? styles.buttonDark : styles.buttonLight
                  ]}
                  onPress={replaceAllInFiles}
                  disabled={!searchResults.length || !searchQuery}
                >
                  <Text style={styles.buttonText}>Replace All</Text>
                </TouchableOpacity>
              </View>
              
              {/* Search results */}
              <ScrollView style={styles.searchResults}>
                <Text style={[
                  styles.searchResultsTitle,
                  theme === 'dark' ? styles.textDark : styles.textLight
                ]}>
                  {searchResults.length > 0
                    ? `Found ${searchResults.reduce((sum, res) => sum + res.matches.length, 0)} matches in ${searchResults.length} files`
                    : searchQuery ? 'No matches found' : ''}
                </Text>
                
                {searchResults.map((result, idx) => (
                  <View key={idx} style={styles.searchResultFile}>
                    <TouchableOpacity
                      style={styles.searchResultFileHeader}
                      onPress={() => openFile(result.file)}
                    >
                      <Icon
                        name={getFileIcon(result.file)}
                        size={16}
                        color={theme === 'dark' ? '#aaa' : '#666'}
                      />
                      <Text style={[
                        styles.searchResultFileName,
                        theme === 'dark' ? styles.textDark : styles.textLight
                      ]}>
                        {result.file.name} ({result.matches.length} matches)
                      </Text>
                    </TouchableOpacity>
                    
                    {result.matches.map((match, midx) => (
                      <TouchableOpacity
                        key={midx}
                        style={styles.searchResultMatch}
                        onPress={() => openFile(result.file)}
                      >
                        <Text style={[
                          styles.searchResultLine,
                          theme === 'dark' ? styles.textDark : styles.textLight
                        ]}>
                          Line {match.line}:
                        </Text>
                        <Text style={[
                          styles.searchResultContent,
                          theme === 'dark' ? styles.textDark : styles.textLight
                        ]}>
                          {match.lineContent.trim()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
        
        {/* Editor (right side) */}
        <View style={[
          styles.editor,
          theme === 'dark' ? styles.editorDark : styles.editorLight
        ]}>
          {/* Tabs */}
          <ScrollView
            horizontal
            style={[
              styles.tabs,
              theme === 'dark' ? styles.tabsDark : styles.tabsLight
            ]}
            contentContainerStyle={styles.tabsContent}
            showsHorizontalScrollIndicator={false}
          >
            {openTabs.map((tab, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.tab,
                  tab.isActive && (theme === 'dark' ? styles.activeTabDark : styles.activeTabLight)
                ]}
                onPress={() => switchTab(index)}
              >
                <Icon
                  name={getFileIcon(tab.file)}
                  size={16}
                  color={theme === 'dark' ? '#ddd' : '#333'}
                  style={styles.tabIcon}
                />
                <Text style={[
                  styles.tabText,
                  theme === 'dark' ? styles.textDark : styles.textLight
                ]}>
                  {tab.file.name}
                </Text>
                <TouchableOpacity
                  style={styles.closeTab}
                  onPress={(e) => closeTab(index, e as any)}
                >
                  <Icon name="close" size={16} color={theme === 'dark' ? '#ddd' : '#333'} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          {/* Editor content */}
          {activeFile ? (
            <View style={styles.editorContent}>
              {/* Line numbers */}
              {renderLineNumbers()}
              
              {/* Text editor */}
              <TextInput
                key={textareaKey}
                ref={textareaRef as any}
                style={[
                  styles.textarea,
                  theme === 'dark' ? styles.textareaDark : styles.textareaLight
                ]}
                multiline
                value={fileContent}
                onChangeText={setFileContent}
                onChange={(e) => handleFileContentChange(e as any)}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />
            </View>
          ) : (
            <View style={styles.emptyEditor}>
              <Icon name="description" size={50} color={theme === 'dark' ? '#555' : '#ccc'} />
              <Text style={[
                styles.emptyEditorText,
                theme === 'dark' ? styles.textDark : styles.textLight
              ]}>
                No file open
              </Text>
              {rootDirectory && (
                <Text style={[
                  styles.emptyEditorSubtext,
                  theme === 'dark' ? styles.textDark : styles.textLight
                ]}>
                  Select a file from the explorer to start editing
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
      
      {/* Status bar */}
      <View style={[
        styles.statusBar,
        theme === 'dark' ? styles.statusBarDark : styles.statusBarLight
      ]}>
        <Text style={[
          styles.statusText,
          theme === 'dark' ? styles.textDark : styles.textLight
        ]}>
          {activeFile ? `${activeFile.path} | ${fileContent.split('\n').length} lines` : 'Ready'}
        </Text>
      </View>
    </SafeAreaView>
  );
};

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    width:'100%',
    height: '100%',
  },
  containerLight: {
    backgroundColor: '#f5f5f5',
  },
  containerDark: {
    backgroundColor: '#1e1e1e',
  },
  header: {
    flexDirection: 'row',
    padding: 10,
    borderBottomWidth: 1,
  },
  headerLight: {
    backgroundColor: '#f0f0f0',
    borderBottomColor: '#ddd',
  },
  headerDark: {
    backgroundColor: '#252526',
    borderBottomColor: '#444',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 300,
    borderRightWidth: 1,
  },
  sidebarLight: {
    backgroundColor: '#f9f9f9',
    borderRightColor: '#ddd',
  },
  sidebarDark: {
    backgroundColor: '#252526',
    borderRightColor: '#444',
  },
  sidebarHeader: {
    padding: 10,
    borderBottomWidth: 1,
  },
  sidebarTitle: {
    fontWeight: 'bold',
  },
  fileTree: {
    flex: 1,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  activeFileItem: {
    backgroundColor: 'rgba(0, 120, 215, 0.1)',
  },
  fileIcon: {
    marginRight: 8,
  },
  fileName: {
    fontSize: 14,
  },
  editor: {
    flex: 1,
    flexDirection: 'column',
  },
  editorLight: {
    backgroundColor: '#fff',
  },
  editorDark: {
    backgroundColor: '#1e1e1e',
  },
  tabs: {
    flexGrow:0,
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabsLight: {
    backgroundColor: '#eee',
    borderBottomColor: '#ddd',
  },
  tabsDark: {
    backgroundColor: '#2d2d2d',
    borderBottomColor: '#444',
  },
  tabsContent: {
    flexDirection: 'row',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingHorizontal: 12,
    borderRightWidth: 1,
  },
  activeTabLight: {
    backgroundColor: '#fff',
    borderBottomWidth: 2,
    borderBottomColor: '#0078d7',
  },
  activeTabDark: {
    backgroundColor: '#1e1e1e',
    borderBottomWidth: 2,
    borderBottomColor: '#0078d7',
  },
  tabIcon: {
    marginRight: 5,
  },
  tabText: {
    fontSize: 13,
  },
  closeTab: {
    marginLeft: 8,
    padding: 2,
  },
  editorContent: {
    flex: 1,
    flexDirection: 'row',
  },
  lineNumbers: {
    width: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'flex-end',
    paddingRight: 5,
    paddingVertical: 10,
  },
  lineNumber: {
    fontSize: 12,
    lineHeight: 20,
    color: '#888',
  },
  textarea: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
    lineHeight: 20,
    borderWidth: 0,
  },
  textareaLight: {
    color: '#333',
  },
  textareaDark: {
    color: '#ddd',
    backgroundColor: '#1e1e1e',
  },
  emptyEditor: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyEditorText: {
    fontSize: 18,
    marginTop: 10,
  },
  emptyEditorSubtext: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 5,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyStateText: {
    fontSize: 16,
    marginVertical: 10,
  },
  emptyStateButton: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#0078d7',
    borderRadius: 4,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  statusBar: {
    flexDirection: 'row',
    padding: 5,
    paddingHorizontal: 10,
  },
  statusBarLight: {
    backgroundColor: '#f0f0f0',
    borderTopColor: '#ddd',
    borderTopWidth: 1,
  },
  statusBarDark: {
    backgroundColor: '#252526',
    borderTopColor: '#444',
    borderTopWidth: 1,
  },
  statusText: {
    fontSize: 12,
  },
  searchPanel: {
    padding: 10,
    borderTopWidth: 1,
  },
  searchPanelLight: {
    backgroundColor: '#f9f9f9',
    borderTopColor: '#ddd',
  },
  searchPanelDark: {
    backgroundColor: '#252526',
    borderTopColor: '#444',
  },
  searchTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  searchInput: {
    flex: 1,
    height: 32,
    marginLeft: 5,
    fontSize: 14,
  },
  inputLight: {
    color: '#333',
    borderColor: '#ddd',
  },
  inputDark: {
    color: '#ddd',
    borderColor: '#555',
  },
  searchOptions: {
    marginVertical: 8,
  },
  searchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  searchOptionText: {
    marginLeft: 5,
    fontSize: 13,
  },
  searchActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  searchButton: {
    flex: 1,
    marginHorizontal: 2,
    padding: 8,
    borderRadius: 4,
    alignItems: 'center',
  },
  buttonLight: {
    backgroundColor: '#e0e0e0',
  },
  buttonDark: {
    backgroundColor: '#3c3c3c',
  },
  buttonText: {
    fontSize: 12,
  },
  searchResults: {
    maxHeight: 200,
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 8,
  },
  searchResultsTitle: {
    fontSize: 12,
    marginBottom: 8,
  },
  searchResultFile: {
    marginBottom: 8,
  },
  searchResultFileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 2,
  },
  searchResultFileName: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  searchResultMatch: {
    paddingLeft: 10,
    paddingVertical: 2,
  },
  searchResultLine: {
    fontSize: 11,
    opacity: 0.7,
  },
  searchResultContent: {
    fontSize: 12,
    marginTop: 2,
  },
  textLight: {
    color: '#333',
  },
  textDark: {
    color: '#eee',
  },
});

export default App;