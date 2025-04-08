import React, { MutableRefObject } from 'react'
import { Image, Linking, TouchableOpacity } from "react-native"
import { View, Text } from "@blacktokki/core";
import { Link } from "../types"

export default ({link, isMobile}:{link:Link, isMobile:boolean})=>{
    return <View style={{borderRadius:6, marginVertical:10, marginHorizontal:8}}>
            <TouchableOpacity
                onPress={()=>Linking.openURL(link.url)}
                onLongPress={()=>{}}
                style={{width:'100%', flexDirection:'row'}}
            >
                {link.imageUrl?<Image source={{uri:link.imageUrl}} resizeMode="cover" style={{ borderRadius:6, width:'100%', maxWidth:isMobile?120:160, maxHeight:isMobile?120:160, borderWidth:1}}/>:undefined}
                <View style={{flex:1, marginHorizontal:20, overflow:'hidden', minHeight:isMobile?90:120}}>
                    <Text style={{fontSize:18}} numberOfLines={1}>{link.title}</Text>
                    <Text style={{fontSize:14}} numberOfLines={7} ellipsizeMode='head'>{link.description}</Text>
                    <Text style={{fontSize:12}} numberOfLines={1}>{link.url}</Text>
                </View>
            </TouchableOpacity>
        </View>

}