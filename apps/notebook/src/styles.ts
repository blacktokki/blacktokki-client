import { StyleSheet, ViewStyle } from 'react-native';

export const createCommonStyles = (theme: 'light' | 'dark') => {
  const card: ViewStyle = {
    backgroundColor: theme === 'dark' ? '#1E1E1E' : '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme === 'dark' ? '#333333' : '#EEEEEE',
    shadowColor: theme === 'dark' ? '#000000' : '#888888',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  };
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme === 'dark' ? '#121212' : '#FFFFFF',
      paddingHorizontal: 24,
      paddingVertical: 16,
    },
    card,
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 8,
      color: theme === 'dark' ? '#FFFFFF' : '#000000',
    },
    text: {
      fontSize: 16,
      color: theme === 'dark' ? '#E4E4E4' : '#333333',
      lineHeight: 24,
    },
    button: {
      backgroundColor: theme === 'dark' ? '#2C73B5' : '#3498DB',
      borderRadius: 4,
      padding: 12,
      alignItems: 'center',
      marginVertical: 8,
    },
    secondaryButton: {
      backgroundColor: theme === 'dark' ? '#4A4A4A' : '#95A5A6',
      borderRadius: 4,
      padding: 12,
      alignItems: 'center',
      marginVertical: 8,
    },
    buttonText: {
      color: '#FFFFFF',
      fontWeight: '500',
      fontSize: 16,
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    searchButton: {
      backgroundColor: '#3498DB',
      justifyContent: 'center',
      alignItems: 'center',
      width: 36,
      height: 36,
      borderRadius: 4,
      marginHorizontal: 4,
    },
    resultSeparator: {
      height: 1,
      backgroundColor: theme === 'dark' ? '#333333' : '#EEEEEE',
    },
    input: {
      backgroundColor: theme === 'dark' ? '#222222' : '#FFFFFF',
      borderWidth: 1,
      borderColor: theme === 'dark' ? '#444444' : '#CCCCCC',
      borderRadius: 4,
      padding: 10,
      color: theme === 'dark' ? '#E4E4E4' : '#333333',
      marginBottom: 16,
    },
    searchInput: {
      backgroundColor: theme === 'dark' ? '#222222' : '#FFFFFF',
      borderWidth: 1,
      borderColor: theme === 'dark' ? '#444444' : '#CCCCCC',
      borderRadius: 4,
      padding: 10,
      color: theme === 'dark' ? '#E4E4E4' : '#333333',
      flex: 1,
      height: 36,
      marginBottom: 0,
      paddingVertical: 4,
      fontSize: 14,
    },
    searchContainer: {
      flexDirection: 'row',
    },
    separator: {
      height: 1,
      backgroundColor: theme === 'dark' ? '#333333' : '#EEEEEE',
      marginVertical: 12,
    },
    smallText: {
      fontSize: 14,
      color: theme === 'dark' ? '#BBBBBB' : '#777777',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    flex: {
      flex: 1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    centerContent: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    statusCard: {
      ...card,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 20,
    },
    navContainer: {
      flex: 1,
      minWidth: 150,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    navButton: {
      width: 30,
      height: 30,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 8,
      borderRadius: 8,
      padding: 8,
      backgroundColor: theme === 'dark' ? '#333333' : '#efefef',
    },
    placeholder: {
      color: theme === 'dark' ? '#777777' : '#999999',
    },
  });
};
