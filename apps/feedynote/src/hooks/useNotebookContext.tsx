import { useAuthContext } from "@blacktokki/account";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Opened = Record<string, {created:boolean}>

const NotebookContext = createContext<{
  opened: Opened; setOpened: (func:(newOpened:Opened)=>void, created:boolean) => void;
}>(
  { opened: {}, setOpened:()=>{} }
);

export const NotebookProvider = (props: { children: React.ReactNode; }) => {
  const [complete, setComplete] = useState(false);
  const [opened, setOpened] = useState<Opened>({});
  const { auth } = useAuthContext()
  const loadOpened = async () =>{
    const v = await AsyncStorage.getItem('opened')
    return (v?JSON.parse(v):{}) as Record<string, number[]>
  }

  useEffect(() => {
    loadOpened().then((v) => {
      if (auth.user){
        const ids:number[] = v[`${auth.user.id}`] || []
        setOpened(Object.fromEntries(ids.map(v=>[`${v}`, {created:false}])));
        setComplete(true);
      }
    });
  }, [auth]);
  const _setOpened = useCallback((func:(newOpened:Opened)=>void, created:boolean)=>{
    const newOpened = {...opened}
    func(newOpened)
    if(created){
      setOpened(newOpened)
    }
    else if(auth.user?.id){
      loadOpened().then(v=>{
        if (auth.user){
          v[`${auth.user.id}`] = Object.keys(newOpened).filter(v => !newOpened[v].created).map(v=>parseInt(v, 10));
          AsyncStorage.setItem('opened', JSON.stringify(v)).then(()=>{
            setOpened(newOpened)
          })
        }
      })
    }
  }, [opened])

  return complete ? (
    <NotebookContext.Provider value={{ opened, setOpened:_setOpened }}>
      {props.children}
    </NotebookContext.Provider>
  ) : (
    <></>
  );
};

export const useOpenedContext = () => {
  const { opened, setOpened } = useContext(NotebookContext);
  const openedIds = Object.entries(opened).map(([k, v])=>(v.created?{created:true, parentId:parseInt(k, 10)}:{created:false, id:parseInt(k, 10)}))
  const addOpened = (id:number, created:boolean)=>{
    setOpened((newOpenIds)=>{
      newOpenIds[`${id}`] = {created}
    }, created)
  }

  const deleteOpened = (id:number, created:boolean)=>{
    setOpened((newOpenIds)=>{
      delete newOpenIds[`${id}`]
    }, created)
  }
  
  return {
    openedIds,
    addOpenedIds:addOpened, 
    deleteOpenedIds:deleteOpened
  }
};
