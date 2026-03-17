import { useCallback, useEffect, useRef, useState } from "react";
import { MicIcon, MicOffIcon, LoaderIcon, SendIcon, XIcon } from "lucide-react";
import { useCreateMemo } from "@/hooks/useMemoQueries";
import toast from "react-hot-toast";

// Extend window for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

const VoiceToText = () => {
  const [isListening, setIsListening] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const createMemo = useCreateMemo();

  // Check browser support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "vi-VN"; // Vietnamese by default

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) {
        setTranscript((prev) => prev + final);
      }
      setInterimText(interim);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        toast.error("🎤 Vui lòng cho phép truy cập microphone!");
      }
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  const toggleListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      try {
        recognition.start();
        setIsListening(true);
        if (navigator.vibrate) navigator.vibrate(30);
      } catch (err) {
        console.error("Failed to start recognition:", err);
      }
    }
  }, [isListening]);

  const handleSave = useCallback(async () => {
    const text = transcript.trim();
    if (!text) {
      toast.error("Chưa có nội dung!");
      return;
    }

    // Stop listening
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    try {
      await createMemo.mutateAsync({ content: `🎤 ${text}\n#voice` } as any);
      toast.success("Đã lưu ghi chú giọng nói! 🎤");
      setTranscript("");
      setInterimText("");
      setIsOpen(false);
    } catch {
      toast.error("Lỗi lưu ghi chú");
    }
  }, [transcript, isListening, createMemo]);

  const handleClose = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    setTranscript("");
    setInterimText("");
    setIsOpen(false);
  }, [isListening]);

  if (!isSupported) return null;

  // Floating mic button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-20 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-rose-600 to-pink-600 text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all flex items-center justify-center"
        title="Ghi chú giọng nói 🎤"
      >
        <MicIcon className="w-6 h-6" />
      </button>
    );
  }

  // Recording panel
  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-auto sm:bottom-6 sm:left-20 z-50 w-auto sm:w-96 bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-rose-600 to-pink-600 text-white">
        <div className="flex items-center gap-2">
          {isListening ? (
            <>
              <span className="w-3 h-3 rounded-full bg-red-400 animate-pulse" />
              <span className="text-sm font-medium">Đang nghe...</span>
            </>
          ) : (
            <span className="text-sm font-medium">🎤 Ghi chú giọng nói</span>
          )}
        </div>
        <button onClick={handleClose} className="p-1 rounded hover:bg-white/20">
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Transcript */}
      <div className="p-4 min-h-[120px] max-h-[200px] overflow-y-auto">
        {transcript || interimText ? (
          <p className="text-sm text-foreground leading-relaxed">
            {transcript}
            {interimText && <span className="text-muted-foreground opacity-50">{interimText}</span>}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground text-center mt-8">
            Nhấn nút mic bên dưới để bắt đầu nói
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
        {/* Mic toggle */}
        <button
          onClick={toggleListening}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
            isListening
              ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30"
              : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
          }`}
        >
          {isListening ? <MicOffIcon className="w-6 h-6" /> : <MicIcon className="w-6 h-6" />}
        </button>

        {/* Language hint */}
        <span className="text-xs text-muted-foreground">Ngôn ngữ: Tiếng Việt</span>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!transcript.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors"
        >
          <SendIcon className="w-4 h-4" />
          Lưu
        </button>
      </div>
    </div>
  );
};

export default VoiceToText;
