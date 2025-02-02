import React from 'react';
import useContentList, { useContentMutation } from '../hooks/useContentList';
import { CommonButton, Text } from '@blacktokki/core';
import { useAuthContext } from '@blacktokki/account';

export default ()=>{
    const { auth } = useAuthContext()
    const list = useContentList(0);
    const {create} = useContentMutation()
    return <>
        <CommonButton onPress={()=>auth.user && create({userId:auth.user?.id, parentId:0, type:'NOTE', input:'hello'})} title='create'/>
        {list?.map(v=><Text key={v.id}>{v.id}</Text>)}
    </>   
}