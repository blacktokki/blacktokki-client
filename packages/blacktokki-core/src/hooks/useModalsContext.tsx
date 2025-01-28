import React, { useState, createContext, useContext, useEffect } from 'react';
import { Modal } from 'react-native';

import useResizeContext from './useResizeContext';

type ModalProps = any;

type ModalState = {
  Component: React.ComponentType<ModalProps>;
  props: any;
  visible: boolean;
};

export type ModalComponent = React.ComponentType<ModalProps>;

type SetModal = (Component: ModalState['Component'] | null, props: ModalProps | null) => void;

const ModalsContext = createContext<{ setModal: SetModal }>({
  setModal: () => {},
});

export const ModalsProvider = ({
  children,
  modals: allModals,
}: {
  children: React.ReactNode;
  modals: ModalComponent[];
}) => {
  const [modals, setModals] = useState<ModalState[]>([]);
  const windowType = useResizeContext();
  const [animationType, setAnimationType] = useState('none');
  const setModal: SetModal = (Component, props) => {
    const newModals = modals.map((m) => {
      if (Component == null || m.Component !== Component) {
        return {
          ...m,
          visible: false,
        };
      } else if (m.Component === Component) {
        return {
          Component,
          props: props !== null ? props : m.props,
          visible: props !== null,
        };
      }
      return m;
    });
    setModals(newModals);
  };
  useEffect(() => {
    if (modals.filter((v) => v.visible).length === 0)
      setAnimationType(windowType === 'landscape' ? 'fade' : 'slide');
  }, [windowType]);
  useEffect(() => {
    setModals(allModals.map((Component) => ({ Component, props: null, visible: false })));
  }, [allModals]);
  return (
    <ModalsContext.Provider value={{ setModal }}>
      {children}
      {modals.map((modal, index) => {
        const { Component, props, visible } = modal;
        return (
          <Modal key={index} animationType={animationType as any} visible={visible} transparent>
            <Component {...props} />
          </Modal>
        );
      })}
    </ModalsContext.Provider>
  );
};

export default () => {
  const modalsContext = useContext(ModalsContext);
  return modalsContext;
};
