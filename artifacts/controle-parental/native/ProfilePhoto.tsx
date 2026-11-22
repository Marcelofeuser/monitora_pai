import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { mediaSource, type NativeUploadFile } from './api';
import { Avatar } from './theme';

type Props = {
  name: string;
  photoUrl?: string | null;
  headers: Record<string, string>;
  size?: number;
  background: string;
  color: string;
  badge?: string;
  /** Sem esta função a foto é só exibida (sem botão de câmera). */
  onUpload?: (file: NativeUploadFile) => Promise<void>;
  disabled?: boolean;
  /** Notifica falhas (permissão, tamanho, rede) para quem mostra a mensagem. */
  onError?: (message: string) => void;
};

export function ProfilePhoto({ name, photoUrl, headers, size = 72, background, color, badge, onUpload, disabled, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const pick = async () => {
    if (!onUpload || busy || disabled) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      onError?.('Permita o acesso às fotos para escolher uma imagem de perfil.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
      onError?.('A foto é maior que 10 MB. Escolha uma imagem menor.');
      return;
    }
    const type = asset.mimeType ?? 'image/jpeg';
    const extension = type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'jpg';
    setBusy(true);
    try {
      await onUpload({ uri: asset.uri, name: asset.fileName || `perfil-${Date.now()}.${extension}`, type });
      setFailed(false);
    } catch (cause) {
      onError?.(cause instanceof Error ? cause.message : 'Não foi possível enviar a foto.');
    } finally {
      setBusy(false);
    }
  };

  const showImage = !!photoUrl && !failed;
  return (
    <View style={{ width: size, height: size }}>
      {showImage ? (
        <Image
          accessibilityLabel={`Foto de ${name}`}
          source={mediaSource(photoUrl as string, headers)}
          onError={() => setFailed(true)}
          style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background }}
        />
      ) : <Avatar label={name} size={size} background={background} color={color} />}
      {onUpload ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Trocar foto de perfil" disabled={busy || disabled} onPress={() => void pick()} style={[styles.badge, { backgroundColor: badge ?? color, right: -2, bottom: -2 }]}>
          {busy ? <ActivityIndicator size="small" color={background} /> : <Feather name="camera" size={14} color={background} />}
        </Pressable>
      ) : null}
    </View>
  );
}

export function PhotoHint({ children, color }: { children: string; color: string }) {
  return <Text style={{ color, fontSize: 12, lineHeight: 17 }}>{children}</Text>;
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
