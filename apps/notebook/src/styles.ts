import { StyleSheet } from 'react-native';

const _createCommonStyles = (theme: 'light' | 'dark') => {
  const isDark = theme === 'dark';

  const commonColors = {
    // Container & Surface
    container: isDark ? '#121212' : '#F5F5F5',
    card: isDark ? '#1E1E1E' : '#FFFFFF',
    cardBorder: isDark ? '#333333' : '#E0E0E0',
    separator: isDark ? '#333333' : '#EEEEEE',

    // Text
    title: isDark ? '#FFFFFF' : '#2C2C2C',
    text: isDark ? '#E4E4E4' : '#454545',
    smallText: isDark ? '#BBBBBB' : '#777777',
    textPlaceholder: isDark ? '#777777' : '#999999',
    textPressable: isDark ? '#FFFFFF88' : '#00000088',

    // Buttons
    button: isDark ? '#2C73B5' : '#3498DB',
    secondaryButton: isDark ? '#4A4A4A' : '#95A5A6',
    navButton: isDark ? '#333333' : '#EBEBEB',

    // Inputs & Tabs & Icons
    input: isDark ? '#222222' : '#FAFAFA',
    inputBorder: isDark ? '#444444' : '#CCCCCC',
    activeTab: isDark ? 'rgba(255, 255, 255, 0.54)' : 'rgba(0, 0, 0, 0.54)',
    inactiveTab: isDark ? '#888888' : '#666666',
    icon: isDark ? '#E4E4E4' : '#333333',
  };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: commonColors.container,
      paddingHorizontal: 24,
      paddingVertical: 16,
    },
    card: {
      backgroundColor: commonColors.card,
      borderRadius: 8,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: commonColors.cardBorder,
      shadowColor: 'gray',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.1 : 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 8,
      color: commonColors.title,
    },
    text: {
      fontSize: 16,
      color: commonColors.text,
      lineHeight: 24,
    },
    button: {
      backgroundColor: commonColors.button,
      borderRadius: 4,
      padding: 12,
      alignItems: 'center',
      marginVertical: 8,
    },
    secondaryButton: {
      backgroundColor: commonColors.secondaryButton,
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
      backgroundColor: commonColors.separator,
    },
    input: {
      backgroundColor: commonColors.input,
      borderWidth: 1,
      borderColor: commonColors.inputBorder,
      borderRadius: 4,
      padding: 10,
      color: commonColors.text,
      marginBottom: 16,
    },
    searchInput: {
      backgroundColor: commonColors.input,
      borderWidth: 1,
      borderColor: commonColors.inputBorder,
      borderRadius: 4,
      padding: 10,
      color: commonColors.text,
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
      backgroundColor: commonColors.separator,
      marginVertical: 12,
    },
    smallText: {
      fontSize: 14,
      color: commonColors.smallText,
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
      backgroundColor: commonColors.navButton,
    },
    placeholder: {
      color: commonColors.textPlaceholder,
    },
    activeTab: {
      color: commonColors.activeTab,
      backgroundColor: commonColors.navButton,
    },
    inactiveTab: {
      color: commonColors.inactiveTab,
      backgroundColor: 'transparent',
    },
    icon: {
      color: commonColors.icon,
    },
    pressibleText: {
      color: commonColors.textPressable,
    },
    resultsContainer: {
      borderWidth: 1,
      borderRadius: 4,
      backgroundColor: commonColors.input,
      borderColor: commonColors.inputBorder,
    },
  });
};

const styleCache = {
  light: _createCommonStyles('light'),
  dark: _createCommonStyles('dark'),
};

export const createCommonStyles = (theme: 'light' | 'dark') => styleCache[theme];
