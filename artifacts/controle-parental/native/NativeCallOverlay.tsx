import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useColors } from '@/hooks/useColors';
import type { NativeCallState } from './useNativeCall';

const END_LABEL: Record<string, string> = {
  declined: 'A chamada foi recusada.',
  missed: 'A chamada não foi atendida.',
  busy: 'A outra pessoa já estava em uma chamada.',
  canceled: 'A chamada foi cancelada.',
  failed: 'A chamada caiu. Confira a conexão e tente de novo.',
  hangup: 'Chamada encerrada.',
};

export function NativeCallOverlay({ call }: { call: NativeCallState }) {
  const colors = useColors();
  const visible = call.phase !== 'idle' || Boolean(call.error);
  const incoming = call.phase === 'ringing-incoming';
  const outgoing = call.phase === 'ringing-outgoing';
  const live = call.phase === 'connecting' || call.phase === 'active';

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={call.hangUp}>
      <View style={styles.root}>
        {live && call.remoteStream ? <RTCView streamURL={call.remoteStream.toURL()} objectFit="cover" style={StyleSheet.absoluteFill} /> : null}
        {live && call.localStream && !call.cameraOff ? (
          <RTCView streamURL={call.localStream.toURL()} mirror objectFit="cover" style={styles.localVideo} />
        ) : null}
        {(incoming || outgoing || !live) && <View style={styles.backdrop} />}

        <View style={styles.content}>
          <View style={styles.identity}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{(call.incomingCall?.callerName ?? call.peerName ?? 'A').charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.name}>{call.incomingCall?.callerName ?? call.peerName ?? 'Ampara'}</Text>
            <Text style={styles.status}>
              {call.error ?? (incoming ? 'Chamada recebida' : outgoing ? 'Chamando…' : call.phase === 'connecting' ? 'Conectando…' : call.phase === 'active' ? 'Em chamada' : call.endedReason ? END_LABEL[call.endedReason] : '')}
            </Text>
          </View>

          {incoming ? (
            <View style={styles.actions}>
              <CallButton label="Recusar" color="#dc2626" onPress={call.declineCall} />
              <CallButton label="Atender" color="#16a34a" onPress={() => void call.acceptCall()} />
            </View>
          ) : outgoing ? (
            <View style={styles.actions}><CallButton label="Cancelar" color="#dc2626" onPress={call.cancelCall} /></View>
          ) : live ? (
            <View style={styles.actions}>
              <CallButton label={call.muted ? 'Ativar mic.' : 'Silenciar'} color={call.muted ? '#475569' : '#1e293b'} onPress={call.toggleMute} />
              <CallButton label="Encerrar" color="#dc2626" onPress={call.hangUp} />
              <CallButton label={call.cameraOff ? 'Ligar câmera' : 'Desligar câmera'} color={call.cameraOff ? '#475569' : '#1e293b'} onPress={call.toggleCamera} />
              <CallButton label="Trocar câmera" color="#1e293b" onPress={call.flipCamera} />
            </View>
          ) : call.error ? (
            <View style={styles.actions}><CallButton label="Fechar" color="#1e293b" onPress={call.hangUp} /></View>
          ) : call.phase === 'ended' ? (
            <ActivityIndicator color="#fff" />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function CallButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: color, opacity: pressed ? 0.75 : 1 }]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617', alignItems: 'center', justifyContent: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#020617' },
  content: { flex: 1, width: '100%', justifyContent: 'space-between', alignItems: 'center', paddingTop: 90, paddingBottom: 50 },
  identity: { alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  avatar: { width: 94, height: 94, borderRadius: 47, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 40, fontWeight: '700' },
  name: { color: '#fff', fontSize: 26, fontWeight: '700', textAlign: 'center' },
  status: { color: '#cbd5e1', fontSize: 15, textAlign: 'center' },
  localVideo: { position: 'absolute', top: 56, right: 18, width: 104, height: 150, borderRadius: 18, zIndex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 14, paddingHorizontal: 20 },
  button: { minWidth: 96, minHeight: 52, borderRadius: 28, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
