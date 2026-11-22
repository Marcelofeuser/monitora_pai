export type NativeCallIdentity =
  | { kind: 'parent'; getToken: () => Promise<string | null> }
  | { kind: 'child'; token: string };
export type NativeCallPhase = 'idle' | 'ringing-outgoing' | 'ringing-incoming' | 'connecting' | 'active' | 'ended';
export type NativeCallReason = 'hangup' | 'declined' | 'missed' | 'busy' | 'canceled' | 'failed';
export type NativeIncomingCall = { callId: string; callerId: string; callerName: string };
export type NativeCallStream = { toURL: () => string } | null;
export type NativeCallState = { phase: NativeCallPhase; incomingCall: NativeIncomingCall | null; peerName: string | null; localStream: NativeCallStream; remoteStream: NativeCallStream; muted: boolean; cameraOff: boolean; error: string | null; endedReason: NativeCallReason | null; startCall: (calleeId: string, calleeName: string) => Promise<void>; acceptCall: () => Promise<void>; declineCall: () => void; cancelCall: () => void; hangUp: () => void; toggleMute: () => void; toggleCamera: () => void; flipCamera: () => void; };
