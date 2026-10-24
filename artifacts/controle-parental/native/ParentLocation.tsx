import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { ChildLocation } from './api';

type Props = {
  childName: string;
  loadLocation: () => Promise<ChildLocation | null>;
  onBack: () => void;
};

export function ParentLocation({ childName, loadLocation, onBack }: Props) {
  const colors = useColors();
  const [location, setLocation] = useState<ChildLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLocation(await loadLocation());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível buscar a localização.');
    } finally {
      setLoading(false);
    }
  }, [loadLocation]);

  useEffect(() => { void refresh(); }, [refresh]);

  const openMap = () => {
    if (!location) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
    void Linking.openURL(url).catch(() => Alert.alert('Mapa indisponível', 'Não foi possível abrir o mapa neste aparelho.'));
  };

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
      <Pressable accessibilityRole="button" onPress={onBack}><Text style={{ color: colors.primary }}>‹ Voltar</Text></Pressable>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>LOCALIZAÇÃO COMPARTILHADA</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>{childName}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Mostramos somente a última posição que a criança compartilhou enquanto usava o app.</Text>
      {loading ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : error ? (
        <Text accessibilityRole="alert" style={[styles.body, { color: colors.destructive }]}>{error}</Text>
      ) : location ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Última posição recebida</Text>
          <Text selectable style={[styles.coordinates, { color: colors.foreground }]}>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Compartilhada em {new Date(location.recordedAt).toLocaleString('pt-BR')}</Text>
          {location.accuracyMeters != null && <Text style={[styles.body, { color: colors.mutedForeground }]}>Precisão aproximada: {Math.round(location.accuracyMeters)} m</Text>}
          <Pressable accessibilityRole="button" onPress={openMap} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Abrir no mapa</Text></Pressable>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Nenhuma posição compartilhada ainda</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>A criança pode compartilhar a localização pelo próprio app. O Ampara não estima nem inventa uma posição.</Text>
        </View>
      )}
      <Pressable accessibilityRole="button" disabled={loading} onPress={() => void refresh()} style={[styles.secondaryButton, { borderColor: colors.border }]}><Text style={{ color: colors.primary }}>{loading ? 'Atualizando…' : 'Atualizar'}</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 22, paddingTop: 34, gap: 12 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginTop: 20 },
  title: { fontSize: 28, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 21 },
  loader: { margin: 36 },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 10, marginTop: 14 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  coordinates: { fontSize: 17, fontVariant: ['tabular-nums'] },
  primaryButton: { minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
