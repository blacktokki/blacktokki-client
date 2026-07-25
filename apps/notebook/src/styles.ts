import { StyleSheet } from 'react-native';

export type AppColors = {
  // From old styles.ts
  container: string;
  card: string;
  cardBorder: string;
  separator: string;
  title: string;
  text: string;
  smallText: string;
  textPlaceholder: string;
  textPressable: string;
  button: string;
  secondaryButton: string;
  navButton: string;
  input: string;
  inputBorder: string;
  activeTab: string;
  inactiveTab: string;
  icon: string;

  // From old Colors
  background: string;
  tint: string;
  tabIconDefault: string;
  tabIconSelected: string;
  hoverColor: string;
  buttonBackgroundColor: string;
  header: string;
  headerTitle: string;
  headerBottomColor: string;
  buttonBorderColor: string;
  iconColor: string;
  borderColor: string;
  focus: string;
};

const getThemeColors = (colorScheme: 'light' | 'dark'): AppColors => {
  const isDark = colorScheme === 'dark';

  // Base Colors for Default
  const colors: AppColors = {
    container: isDark ? '#121212' : '#F5F5F5',
    card: isDark ? '#1E1E1E' : '#FFFFFF',
    cardBorder: isDark ? '#333333' : '#E0E0E0',
    separator: isDark ? '#333333' : '#EEEEEE',
    title: isDark ? '#FFFFFF' : '#2C2C2C',
    text: isDark ? '#E4E4E4' : '#454545',
    smallText: isDark ? '#BBBBBB' : '#777777',
    textPlaceholder: isDark ? '#777777' : '#999999',
    textPressable: isDark ? '#FFFFFF88' : '#00000088',
    button: isDark ? '#2C73B5' : '#3498DB',
    secondaryButton: isDark ? '#4A4A4A' : '#95A5A6',
    navButton: isDark ? '#333333' : '#EBEBEB',
    input: isDark ? '#222222' : '#FAFAFA',
    inputBorder: isDark ? '#444444' : '#CCCCCC',
    activeTab: isDark ? '#FFFFFF' : '#000000',
    inactiveTab: isDark ? '#888888' : '#666666',
    icon: isDark ? '#E4E4E4' : '#333333',
    background: isDark ? '#000000' : '#FFFFFF',
    tint: isDark ? '#FFFFFF' : '#2f95dc',
    tabIconDefault: '#cccccc',
    tabIconSelected: isDark ? '#FFFFFF' : '#2f95dc',
    hoverColor: isDark ? '#010409' : 'rgb(242,242,242)',
    buttonBackgroundColor: isDark ? '#010409' : '#f6f8fa',
    header: isDark ? '#010409' : '#f6f8fa',
    headerTitle: isDark ? '#fff' : '#000',
    headerBottomColor: isDark ? 'rgb(40, 40, 40)' : 'rgb(216, 216, 216)',
    buttonBorderColor: isDark ? 'rgba(229,225,220,0.15)' : 'rgba(27,31,36,0.15)',
    iconColor: isDark ? '#FFFFFF' : '#000000',
    borderColor: '#d0d7de',
    focus: '#0065A4',
  };

  return colors;
};

const getThemeLayout = (isDark: boolean) => {
  const borderRadius = 8;
  const paddingHorizontal = 24;
  const paddingVertical = 16;
  const cardPadding = 16;
  const shadowOpacity = isDark ? 0.1 : 0.05;
  const fontFamily: string | undefined = undefined;
  const buttonBorderRadius = 8;

  return {
    borderRadius,
    paddingHorizontal,
    paddingVertical,
    cardPadding,
    shadowOpacity,
    fontFamily,
    buttonBorderRadius,
  };
};

export const createCommonStyles = (colorScheme: 'light' | 'dark') => {
  const commonColors = getThemeColors(colorScheme);
  const isDark = colorScheme === 'dark';
  const layout = getThemeLayout(isDark);

  return StyleSheet.create({
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
      color: commonColors.activeTab,
      backgroundColor: commonColors.navButton,
      borderBottomWidth: 2,
      borderBottomColor: commonColors.focus,
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
};
