import { StyleSheet } from 'react-native';

import { AppColors } from '../../styles';

const getColors = (isDark: boolean): AppColors => {
  if (isDark) {
    return {
      background: '#121212',
      container: '#121212',
      card: '#1E1E1E',
      cardBorder: '#333333',
      header: '#1E1E1E',
      headerTitle: '#EEEEEE',
      headerBottomColor: '#1E1E1E',
      buttonBackgroundColor: '#1E1E1E',
      buttonBorderColor: '#333333',
      hoverColor: '#2A2A2A',
      text: '#DDDDDD',
      title: '#EEEEEE',
      iconColor: '#DDDDDD',
      focus: '#00A495',
      button: '#00A495',
      activeTab: '#00A495',
      inactiveTab: '#888888',
      navButton: '#2A2A2A',
      separator: '#333333',
      // Default fallbacks for remaining properties
      smallText: '#BBBBBB',
      textPlaceholder: '#777777',
      textPressable: '#FFFFFF88',
      secondaryButton: '#4A4A4A',
      input: '#2A2A2A',
      inputBorder: '#444444',
      icon: '#E4E4E4',
      tint: '#FFFFFF',
      tabIconDefault: '#cccccc',
      tabIconSelected: '#FFFFFF',
      borderColor: '#333333',
    };
  }
  return {
    background: '#EFEFEF',
    container: '#EFEFEF',
    card: '#FFFFFF',
    cardBorder: '#CCCCCC',
    header: '#00A495',
    headerTitle: '#FFFFFF',
    headerBottomColor: '#00A495',
    buttonBackgroundColor: '#FFFFFF',
    buttonBorderColor: '#CCCCCC',
    hoverColor: '#F2F2F2',
    text: '#212529',
    title: '#212529',
    iconColor: '#373A3C',
    focus: '#00A495',
    button: '#00A495',
    activeTab: '#00A495',
    inactiveTab: '#777777',
    navButton: '#009083',
    separator: '#DDDDDD',
    // Default fallbacks for remaining properties
    smallText: '#777777',
    textPlaceholder: '#999999',
    textPressable: '#00000088',
    secondaryButton: '#95A5A6',
    input: '#FFFFFF',
    inputBorder: '#CCCCCC',
    icon: '#333333',
    tint: '#00A495',
    tabIconDefault: '#cccccc',
    tabIconSelected: '#00A495',
    borderColor: '#CCCCCC',
  };
};

export const createCommonStyles = (colorScheme: 'light' | 'dark') => {
  const isDark = colorScheme === 'dark';
  const commonColors = getColors(isDark);

  const layout = {
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    cardPadding: 20,
    shadowOpacity: 0,
    fontFamily: undefined as string | undefined,
    buttonBorderRadius: 2,
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: commonColors.container,
      paddingHorizontal: layout.paddingHorizontal,
      paddingVertical: layout.paddingVertical,
    },
    card: {
      backgroundColor: commonColors.card,
      borderRadius: layout.borderRadius,
      padding: layout.cardPadding,
      marginBottom: 16,
      borderWidth: 0,
      borderColor: 'transparent',
      shadowOpacity: layout.shadowOpacity,
      elevation: 0,
    },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 12,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderColor: commonColors.separator,
      color: commonColors.title,
      fontFamily: layout.fontFamily,
    },
    text: {
      fontSize: 16,
      color: commonColors.text,
      lineHeight: 24,
      fontFamily: layout.fontFamily,
    },
    button: {
      backgroundColor: commonColors.button,
      borderRadius: layout.buttonBorderRadius,
      padding: 12,
      alignItems: 'center',
      marginVertical: 8,
    },
    secondaryButton: {
      backgroundColor: commonColors.secondaryButton,
      borderRadius: layout.buttonBorderRadius,
      padding: 12,
      alignItems: 'center',
      marginVertical: 8,
    },
    buttonText: {
      color: '#FFFFFF',
      fontWeight: '500',
      fontSize: 16,
      fontFamily: layout.fontFamily,
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    searchButton: {
      backgroundColor: commonColors.button,
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
      borderRadius: layout.borderRadius,
      padding: 10,
      color: commonColors.text,
      marginBottom: 16,
      fontFamily: layout.fontFamily,
    },
    searchInput: {
      backgroundColor: commonColors.input,
      borderWidth: 1,
      borderColor: commonColors.inputBorder,
      borderRadius: layout.borderRadius,
      padding: 10,
      color: commonColors.text,
      flex: 1,
      height: 36,
      marginBottom: 0,
      paddingVertical: 4,
      fontSize: 14,
      fontFamily: layout.fontFamily,
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
      fontFamily: layout.fontFamily,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    appHeader: {
      backgroundColor: commonColors.header,
    },
    appHeaderTitle: {
      color: commonColors.headerTitle,
    },
    appHeaderLeftContainer: {
      backgroundColor: commonColors.header,
      borderBottomWidth: 1,
      borderColor: commonColors.headerBottomColor,
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
      color: isDark ? commonColors.activeTab : '#FFFFFF',
      backgroundColor: commonColors.navButton,
      borderBottomWidth: 3,
      borderBottomColor: commonColors.focus,
    },
    inactiveTab: {
      color: commonColors.inactiveTab,
      backgroundColor: 'transparent',
      borderBottomWidth: 3,
      borderBottomColor: 'transparent',
    },
    icon: {
      color: commonColors.icon,
    },
    iconColor: {
      color: commonColors.iconColor,
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
    backgroundView: {
      flex: 1,
      backgroundColor: commonColors.background,
    },
    backgroundContainer: {
      backgroundColor: commonColors.background,
    },
    otpInput: {
      color: commonColors.text,
      borderColor: commonColors.buttonBorderColor,
    },
    focusedBorder: {
      borderColor: commonColors.text,
    },
    transparentBorder: {
      borderColor: 'transparent',
    },
  });

  return { ...styles, colors: commonColors };
};
