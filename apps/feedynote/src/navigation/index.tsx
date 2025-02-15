import React from 'react';
import * as Linking from 'expo-linking';
import { login, Navigation } from "@blacktokki/navigation"
import { NavigationConfig } from '@blacktokki/navigation/build/typescript/types';
import { main } from '../screens';
import Drawer from './Drawer';
import { Colors, useColorScheme } from '@blacktokki/core';
import { Icon, List, MD2DarkTheme, MD2LightTheme, PaperProvider } from 'react-native-paper';

const config:NavigationConfig = {
    main,
    login,
    prefixes: [ Linking.makeUrl('/') ],
    rootPath: 'feedynote',
    documentTitle: {
        formatter: ()=>{
            return 'feedynote'
        }
    },
    rootScreen: {
        main: 'HomeScreen',
        login: 'LoginScreen'
    },
    headerLeftIcon: <List.Icon icon='backburger' style={{left:-18, top: -14}} />,
    headerRight: <></>,
    modals: [],
    drawer: <Drawer/>
}

export default () => {
    const scheme = useColorScheme()
    const preTheme = scheme == 'dark' ? MD2DarkTheme : MD2LightTheme;
    const theme:typeof preTheme = {...preTheme, colors:{...preTheme.colors, primary:Colors[scheme].text} }
    return <PaperProvider theme={theme}>
        <Navigation config={config}/>
    </PaperProvider>
}