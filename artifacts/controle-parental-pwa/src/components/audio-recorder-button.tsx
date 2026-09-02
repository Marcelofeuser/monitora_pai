import { useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

// Botão de "mensagem de voz" — clique pra começar a gravar, clique de novo
// pra parar e mandar na hora (igual figurinha: não passa pelo composer de
// texto, não precisa de legenda). Usa a MediaRecorder API nativa do
// navegador, sem dependência nova. O formato gravado varia por navegador
// (webm no Chrome/Firefox/Android, mp4 no Safari/iOS) — o backend aceita os
// dois (ver mediaStorage.ts).
export function AudioRecorderButton({
  onRecorded,
  onError,
  disabled,
}: {
  onRecorded: (file: File) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    if (recording || disabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      onError('Este navegador não suporta gravação de áudio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (blob.size === 0) return;
        const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
        onRecorded(new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      onError('Não foi possível acessar o microfone — verifique a permissão do navegador.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (recording) stopRecording();
        else void startRecording();
      }}
      disabled={disabled}
      aria-label={recording ? 'Parar gravação e enviar áudio' : 'Gravar mensagem de áudio'}
      data-testid="button-audio-recorder"
      className={`grid size-11 shrink-0 place-items-center rounded-md border transition-colors ${
        recording
          ? 'animate-pulse border-[hsl(var(--destructive))] text-[hsl(var(--destructive))]'
          : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
      }`}
    >
      {recording ? <Square size={16} /> : <Mic size={18} />}
    </button>
  );
}
