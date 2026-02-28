import { Colors, useColorScheme, useLangContext, Text, useModalsContext } from '@blacktokki/core';
import { AccountEditSection, accountEditStyles } from '@blacktokki/navigation';
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { usePat, usePatMutation } from '../hooks/usePat';
import { createCommonStyles } from '../styles';

const renderToggle = (active: boolean, color: string) => {
  return <Icon name={active ? 'chevron-up' : 'chevron-down'} size={14} color={color} />;
};

const ExtraAuthSection = React.memo(() => {
  const { lang } = useLangContext();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const sectionStyles = accountEditStyles.colors[theme];
  const colors = Colors[theme];

  //pat
  const { data: pats = [] } = usePat();
  const { createPat, deletePat } = usePatMutation();
  const [showPat, setShowPat] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  return (
    <View style={{ marginTop: 10 }}>
      <TouchableOpacity
        style={[accountEditStyles.styles.toggle, { borderTopColor: colors.buttonBorderColor }]}
        onPress={() => setShowPat(!showPat)}
      >
        <Text style={[accountEditStyles.styles.label, { color: colors.text, flex: 1 }]}>
          {lang('Personal Access Token')}
        </Text>
        {renderToggle(showPat, colors.text)}
      </TouchableOpacity>

      {showPat && (
        <View style={{ paddingLeft: 10, marginBottom: 10 }}>
          <View style={styles.patHeader}>
            <Text style={[commonStyles.smallText, { flex: 1 }]}>
              {lang('Manage your access tokens')}
            </Text>
            <TouchableOpacity
              onPress={() => createPat.mutate(undefined, { onSuccess: (t) => setNewToken(t) })}
            >
              <Text style={styles.generateText}>{lang('Generate New Token')}</Text>
            </TouchableOpacity>
          </View>

          {newToken && (
            <View
              style={[
                styles.newTokenBox,
                {
                  backgroundColor: sectionStyles.newTokenBg,
                  borderColor: sectionStyles.newTokenBorder,
                },
              ]}
            >
              <Text style={{ fontSize: 12, color: sectionStyles.newTokenText }}>
                {lang("Copy your new token now. It won't be shown again.")}
              </Text>
              <Text
                selectable
                style={[
                  commonStyles.text,
                  {
                    fontWeight: 'bold',
                    marginVertical: 8,
                  },
                ]}
              >
                {newToken}
              </Text>
            </View>
          )}

          {pats.map((pat) => (
            <View
              key={pat.id}
              style={[styles.patRow, { borderBottomColor: colors.buttonBorderColor }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[commonStyles.text, { fontSize: 14 }]}>
                  {pat.description || lang('No Description')}
                </Text>
                <Text style={commonStyles.smallText}>
                  {lang('Expires')}: {pat.expired}
                </Text>
              </View>
              <TouchableOpacity onPress={() => deletePat.mutate(pat.id)}>
                <Icon name="trash" size={16} color="#d9534f" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

export default function AccountEditModal({ openOtp }: { openOtp?: boolean } = {}) {
  const { setModal } = useModalsContext();

  const [loading, setLoading] = useState(false);

  const close = () => {
    setModal(AccountEditModal as any, null);
  };

  return (
    <AccountEditSection
      loading={loading}
      openOtp={openOtp}
      setLoading={setLoading}
      renderToggle={renderToggle}
      onClose={close}
    >
      <ExtraAuthSection />
    </AccountEditSection>
  );
}

const styles = StyleSheet.create({
  patHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  generateText: {
    color: '#3498DB',
    fontWeight: 'bold',
    fontSize: 14,
  },
  newTokenBox: {
    backgroundColor: '#fffbe6',
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ffe58f',
    marginBottom: 10,
  },
  patRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
});
