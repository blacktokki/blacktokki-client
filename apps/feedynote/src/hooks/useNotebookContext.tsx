import { useAuthContext } from "@blacktokki/account";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Opened = Record<string, number[]>

const NotebookContext = createContext<{opened: Opened; setOpened: (opened:Opened) => void;}>({ opened: {}, setOpened: () => {} });

export const NotebookProvider = (props: { children: React.ReactNode; }) => {
  const [complete, setComplete] = useState(false);
  const [opened, setOpened] = useState<Opened>({});
  useEffect(() => {
    AsyncStorage.getItem('opened').then((v) => {
      setOpened(v?JSON.parse(v):{});
      setComplete(true);
    });
  }, []);
  return complete ? (
    <NotebookContext.Provider value={{ opened, setOpened }}>
      {props.children}
    </NotebookContext.Provider>
  ) : (
    <></>
  );
};

const emptySet = new Set()

export default () => {
  const { opened, setOpened } = useContext(NotebookContext);
  const { auth } = useAuthContext()
  const openedIds = useMemo(()=>{
    return new Set(opened[`${auth.user?.id || 0}`]) || emptySet
  }, [opened, auth])
  const updateIds = useCallback((v:Set<number>)=>{
    const newOpened = {...opened}
    newOpened[`${auth.user?.id || 0}`] = [...v.values()]
    AsyncStorage.setItem('opened', JSON.stringify(newOpened)).then(()=>setOpened(newOpened))
  }, [auth, opened])
  const addOpenedIds = (id:number)=>{
    const newOpenIds = new Set(openedIds)
    newOpenIds.add(id)
    updateIds(newOpenIds)
  }
  const deleteOpenedIds = (id:number)=>{
    const newOpenIds = new Set(openedIds)
    newOpenIds.delete(id)
    updateIds(newOpenIds)
  }
  return {
    openedIds,
    addOpenedIds, 
    deleteOpenedIds
  }
};
