import { StyleSheet } from 'react-native';

import { AppColors } from '../../styles';

const getColors = (isDark: boolean): AppColors => {
  if (isDark) {
    return {
      background: '#0D1117',
      container: '#0D1117',
      card: '#161B22',
      cardBorder: '#30363D',
      header: '#161B22',
      headerBottomColor: '#30363D',
      buttonBackgroundColor: '#21262D',
      buttonBorderColor: '#30363D',
      hoverColor: '#161B22',
      text: '#C9D1D9',
      title: '#FFFFFF',
      iconColor: '#C9D1D9',
      focus: '#58A6FF',
      button: '#238636',
      activeTab: '#C9D1D9',
      inactiveTab: '#8B949E',
      navButton: '#21262D',
      separator: '#21262D',
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
    card: '#F6F8FA',
    cardBorder: '#D0D7DE',
    header: '#F6F8FA',
    headerBottomColor: '#D0D7DE',
    buttonBackgroundColor: '#F6F8FA',
    buttonBorderColor: '#D0D7DE',
    hoverColor: '#F3F4F6',
    text: '#24292F',
    title: '#000000',
    iconColor: '#24292F',
    focus: '#0969DA',
    button: '#2DA44E',
    activeTab: '#24292F',
    inactiveTab: '#57606A',
    navButton: '#F3F4F6',
    separator: '#EAEEF2',
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
    borderRadius: 6,
    paddingHorizontal: 24,
    paddingVertical: 20,
    cardPadding: 16,
    shadowOpacity: isDark ? 0.2 : 0.04,
    fontFamily: undefined as string | undefined,
    buttonBorderRadius: 6,
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
      borderBottomWidth: 2,
      borderBottomColor: '#F78166',
    },
    inactiveTab: {
      color: commonColors.inactiveTab,
      backgroundColor: 'transparent',
      borderBottomWidth: 2,
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
