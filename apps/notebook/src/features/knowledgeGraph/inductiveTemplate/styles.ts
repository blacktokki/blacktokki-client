import { StyleSheet } from 'react-native';

export const templateGraphStyles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9.5,
    paddingVertical: 5.5,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: '100%',
  },
  icon: { marginRight: 5 },
  toggleText: { fontSize: 11, flexShrink: 1 },
  webButton: { pointerEvents: 'auto', cursor: 'pointer' } as any,
  related: { gap: 8, marginVertical: 8 },
  label: { fontSize: 11, lineHeight: 16 },
  list: { flexDirection: 'row', gap: 6 },
  chip: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, maxWidth: 250 },
});
