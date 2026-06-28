import { StyleSheet } from 'react-native';

import { AppColors } from '../../styles';

const getColors = (isDark: boolean): AppColors => {
  if (isDark) {
    return {
      background: '#1F2023',
      container: '#1F2023',
      card: '#2D2F31',
      cardBorder: '#383838',
      header: '#2D2F31',
      headerBottomColor: '#383838',
      buttonBackgroundColor: '#2D2F31',
      buttonBorderColor: '#383838',
      hoverColor: '#2D2F31',
      text: '#DDDDDD',
      title: '#FFFFFF',
      iconColor: '#DDDDDD',
      focus: '#00A495',
      button: '#00A495',
      activeTab: '#00A495',
      inactiveTab: '#888888',
      navButton: '#2D2F31',
      separator: '#383838',
      // Default fallbacks for remaining properties
      smallText: '#BBBBBB',
      textPlaceholder: '#777777',
      textPressable: '#FFFFFF88',
      secondaryButton: '#4A4A4A',
      input: '#222222',
      inputBorder: '#444444',
      icon: '#E4E4E4',
      tint: '#FFFFFF',
      tabIconDefault: '#cccccc',
      tabIconSelected: '#FFFFFF',
      borderColor: '#d0d7de',
    };
  }
  return {
    background: '#FFFFFF',
    container: '#FFFFFF',
    card: '#F8F9FA',
    cardBorder: '#CCCCCC',
    header: '#00A495',
    headerBottomColor: '#008C7F',
    buttonBackgroundColor: '#F8F9FA',
    buttonBorderColor: '#CCCCCC',
    hoverColor: '#F2F2F2',
    text: '#373A3C',
    title: '#212529',
    iconColor: '#373A3C',
    focus: '#00A495',
    button: '#00A495',
    activeTab: '#00A495',
    inactiveTab: '#777777',
    navButton: '#F2F2F2',
    separator: '#E5E5E5',
    // Default fallbacks for remaining properties
    smallText: '#777777',
    textPlaceholder: '#999999',
    textPressable: '#00000088',
    secondaryButton: '#95A5A6',
    input: '#FAFAFA',
    inputBorder: '#CCCCCC',
    icon: '#333333',
    tint: '#2f95dc',
    tabIconDefault: '#cccccc',
    tabIconSelected: '#2f95dc',
    borderColor: '#d0d7de',
  };
};

export const createCommonStyles = (colorScheme: 'light' | 'dark') => {
  const isDark = colorScheme === 'dark';
  const commonColors = getColors(isDark);

  const layout = {
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    cardPadding: 14,
    shadowOpacity: 0,
    fontFamily: undefined as string | undefined,
    buttonBorderRadius: 4,
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
      borderWidth: 1,
      borderColor: commonColors.cardBorder,
      shadowColor: 'gray',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: layout.shadowOpacity,
      shadowRadius: 4,
      elevation: 2,
    },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 8,
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
