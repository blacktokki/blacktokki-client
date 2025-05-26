import { CommonButton, Text, useLangContext, useModalsContext, View } from '@blacktokki/core';
import React from 'react';

export default function AlertModal({
  type,
  callbacks,
}: {
  type: string;
  callbacks: (() => void)[];
}) {
  const { lang } = useLangContext();
  const { setModal } = useModalsContext();
  const back = () => {
    setModal(AlertModal, null);
  };
  const messages = {
    UNSAVED: {
      message: 'Changes that you made may not be saved.',
      buttons: [
        {
          title: 'save',
          onPress: () => {
            callbacks[0]();
            back();
          },
        },
        {
          title: 'do not save',
          onPress: () => {
            callbacks[1]();
            back();
          },
        },
      ],
    },
  } as Record<string, { message: string; buttons: { title: string; onPress: () => void }[] }>;

  return (
    <View
      style={{ flex: 1, margin: 0, justifyContent: 'flex-end', backgroundColor: 'transparent' }}
    >
      <View style={{ padding: 16 }}>
        <Text>{lang(messages[type].message)}</Text>
        <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'flex-end' }}>
          {messages[type].buttons.map((button, i) => (
            <CommonButton
              key={i}
              style={{ marginRight: 10 }}
              title={lang(button.title)}
              onPress={button.onPress}
            />
          ))}
          <CommonButton title={lang('cancel')} onPress={() => back()} />
        </View>
      </View>
    </View>
  );
}
