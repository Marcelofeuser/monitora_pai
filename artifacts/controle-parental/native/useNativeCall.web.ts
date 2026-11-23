import { useCallback, useState } from 'react';
import type { NativeCallIdentity, NativeCallState } from './useNativeCall.types';
export function useNativeCall(_identity: NativeCallIdentity | null): NativeCallState {
 const [error, setError] = useState<string | null>(null);
 const unavailable = useCallback(async () => { setError('Chamadas de voz e vídeo estão disponíveis somente no aplicativo Ampara.'); }, []);
 const close = useCallback(() => setError(null), []);
 return { phase: error ? 'ended' : 'idle', incomingCall: null, peerName: null, localStream: null, remoteStream: null, muted: false, cameraOff: false, error, endedReason: null, startCall: unavailable, acceptCall: unavailable, declineCall: close, cancelCall: close, hangUp: close, toggleMute: close, toggleCamera: close, flipCamera: close };
}
