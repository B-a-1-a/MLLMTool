"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Mic, StopCircle } from "lucide-react"
import type { AudioSource } from "../types/audio"

interface RecordSourceDialogProps {
  onAddSource: (source: AudioSource) => void
}

export function RecordSourceDialog({ onAddSource }: RecordSourceDialogProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const recordedBlob = new Blob(audioChunks.current, { type: "audio/wav" });
        setAudioBlob(recordedBlob);
        audioChunks.current = [];
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const saveRecording = () => {
    if (!audioBlob) return;

    const audioURL = URL.createObjectURL(audioBlob);
    const newSource: AudioSource = {
      id: Date.now().toString(),
      title: `Recording ${new Date().toLocaleTimeString()}`,
      type: "audio",
      duration: "Unknown", // Duration calculation can be added later
      path: audioURL,
    };

    onAddSource(newSource);

    // Reset the component state after saving
    setIsDialogOpen(false);
    setAudioBlob(null);
    setIsRecording(false);
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button className="mt-2 w-full flex items-center gap-2">
          <Mic className="h-5 w-5" />
          Record Audio
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Audio</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-4">
          {isRecording ? (
            <Button variant="destructive" onClick={stopRecording} className="flex items-center gap-2">
              <StopCircle className="h-5 w-5" />
              Stop Recording
            </Button>
          ) : (
            <Button variant="default" onClick={startRecording} className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              Start Recording
            </Button>
          )}

          {audioBlob && (
            <div className="w-full">
              <audio controls src={URL.createObjectURL(audioBlob)} className="w-full" />
              <Button onClick={saveRecording} className="mt-2 w-full">
                Save Recording
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
