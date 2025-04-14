import { StyleSheet } from 'react-native';

export const createCommonStyles = (theme: 'light' | 'dark') => {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme === 'dark' ? '#121212' : '#FFFFFF',
      padding: 16,
    },
    card: {
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
    },
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
    buttonText: {
      color: '#FFFFFF',
      fontWeight: '500',
      fontSize: 16,
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
  });
};