import React, { MutableRefObject } from 'react'
import { Image, Linking, TouchableOpacity } from "react-native"
import { View, Text } from "@blacktokki/core";
import { Link } from "../types"

const _tmp = (re:RegExp, description :string)=>{
    let str = description;
    let index = 0;
    let match;
    let arr = []
    while ((match = new RegExp(re).exec(str)) != null) {
      arr.push({index, str:str.substring(0, match.index)})
      const end = match.index + match[0].length
      arr.push({index:index + match.index, str:str.substring(match.index, end)})
      index += end;
      str = str.substring(end)
    }
    arr.push({index, str})
    return arr
  }

const re = /https?:\/\/(?:www\\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi

export const toUrls = (str:string)=>{
    return _tmp(re, str).filter((v, i)=>i % 2 == 1).map(v=>v.str)
}


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