import React, { Suspense } from 'react';
// import * as Linking from 'expo-linking';
import { login, Navigation, NavigationConfig } from "@blacktokki/navigation"
import { main } from '../screens';
import Drawer from './Drawer';
import { Colors, useColorScheme } from '@blacktokki/core';
import { List, MD2DarkTheme, MD2LightTheme, PaperProvider } from 'react-native-paper';
import { NotebookProvider } from '../hooks/useNotebookContext';

const getConfig = async () => {
    const Linking = await import('expo-linking')
    return {
        main,
        login,
        prefixes: [ Linking.makeUrl('/') ],
        rootPath: 'blacktokki-notebook',
        documentTitle: {
            formatter: ()=>{
                return 'blacktokki-notebook'
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
    } as NavigationConfig
}

export default () => {
    const scheme = useColorScheme()
    const preTheme = scheme == 'dark' ? MD2DarkTheme : MD2LightTheme;
    const theme:typeof preTheme = {...preTheme, colors:{...preTheme.colors, primary:Colors[scheme].text} }
    const NavigationLazy = React.lazy(()=>getConfig().then(config=> ({"default":()=><Navigation config={config}/>})))
    return <PaperProvider theme={theme}>
        <NotebookProvider>
            <Suspense fallback={<></>}>
                <NavigationLazy/>
            </Suspense>
        </NotebookProvider>
    </PaperProvider>
}