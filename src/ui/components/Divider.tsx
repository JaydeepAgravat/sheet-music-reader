import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/ui/theme';

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, marginLeft: inset, backgroundColor: colors.borderSubtle }} />;
}
