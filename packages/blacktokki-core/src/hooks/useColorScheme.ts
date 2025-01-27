import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo, useEffect, useState } from 'react';
import { ColorSchemeName, Appearance } from 'react-native';
import { useColorScheme as useNativeColorScheme } from 'react-native'
// The useColorScheme value is always either light or dark, but the built-in
// type suggests that it can be null. This will not happen in practice, so this
// makes it a bit easier to work with.

export function useInitColorScheme(){
  const [complete, setComplete] = useState(false)
  useEffect(()=>{
    if (!complete){
      AsyncStorage.getItem("color").then(v=>{
        Appearance.setColorScheme((v==null)?'no-preference':(v as any))
        setComplete(true)
      })
    }
  }, [complete])
  return complete
}

export function setColorScheme(colorScheme:ColorSchemeName){
  AsyncStorage.setItem('color',colorScheme as string).then(()=>Appearance.setColorScheme(colorScheme))
}

export default function useColorScheme(): "light" | "dark" {
  const scheme = useNativeColorScheme()
  return useMemo(()=>scheme==='dark'?'dark':"light", [scheme])
}
