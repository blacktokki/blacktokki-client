import React from 'react';
import * as Linking from 'expo-linking';
import { login, Navigation } from "@blacktokki/navigation"
import { NavigationConfig } from '@blacktokki/navigation/build/typescript/types';
import { main } from '../screens';
import Drawer from './Drawer';

const config:NavigationConfig = {
    main,
    login,
    prefixes: [ Linking.makeUrl('/') ],
    rootPath: 'spreadocs',
    documentTitle: {
        formatter: ()=>{
            return 'Spreadocs'
        }
    },
    rootScreen: {
        main: 'HomeScreen',
        login: 'LoginScreen'
    },
    headerLeftIcon: <></>,
    headerRight: <></>,
    modals: [],
    drawer: <Drawer/>
}

export default () => {
    return <Navigation config={config}/>
}