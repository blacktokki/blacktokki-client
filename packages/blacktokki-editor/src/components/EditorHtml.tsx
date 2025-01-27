import React, { Suspense } from 'react'
import {Colors,  useColorScheme} from "@blacktokki/core";
import { ScrollView, Text } from 'react-native';

const RenderHTML = React.lazy(()=> import('react-native-render-html'))

export const regexForStripHTML = /<\/?[^>]*>/gi;

export default React.memo(({content}:{content:string})=>{
    const theme = useColorScheme()
    return <ScrollView contentContainerStyle={{paddingHorizontal:15, backgroundColor:Colors[theme].background}}>
        <Suspense fallback={<Text>{content.replaceAll(regexForStripHTML, '')}</Text>}>
            <RenderHTML defaultTextProps={{selectable:true}} contentWidth={320} source={{'html':content}} baseStyle={{color:Colors[theme].text}}/>
        </Suspense>
    </ScrollView>
})