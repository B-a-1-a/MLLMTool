"use client";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Mic, StopCircle } from "lucide-react";
import type { AudioSource } from "../types/audio";
import { uploadAudio, saveMetadata, fetchLatestRecording } from "@/lib/audioUploader";
import { transcribeAudio } from "@/lib/transcribe";
import { summarizeTranscript } from "@/lib/summarize";

export function RecordSourceDialog({ onAddSource }: { onAddSource: (source: AudioSource) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<BlobPart[]>([]);

  const startRecording = async () => {
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
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const saveRecording = async () => {
    if (!audioBlob) {
      alert("No audio recorded!");
      return;
    }

    const file = new File([audioBlob], `recording-${Date.now()}.wav`, { type: "audio/wav" });

    // 🟢 Upload the file to Supabase
    const filePath = await uploadAudio(file);
    if (!filePath) {
      alert("Failed to upload audio");
      return;
    }

    // 🟢 Fetch the uploaded file URL
    const recording = await fetchLatestRecording();
    if (!recording) {
      alert("Failed to retrieve recording URL");
      return;
    }

    const fileUrl = recording.file_url;

    // 🟢 Transcribe the uploaded file
    const transcriptText = await transcribeAudio(fileUrl);
    setTranscript(transcriptText);

    // 🟢 Summarize the transcript
    const summaryText = await summarizeTranscript(transcriptText);
    setSummary(summaryText);

    // 🟢 Save metadata (transcript & summary) in Supabase
    await saveMetadata(filePath, file.name, transcriptText, summaryText);

    const newSource: AudioSource = {
      id: Date.now().toString(),
      title: `Recording ${new Date().toLocaleTimeString()}`,
      type: "audio",
      duration: "Unknown",
      path: fileUrl,
    };

    onAddSource(newSource);
  };

  return (
    <Dialog>
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
            <Button variant="destructive" onClick={stopRecording}>
              <StopCircle className="h-5 w-5" />
              Stop Recording
            </Button>
          ) : (
            <Button variant="default" onClick={startRecording}>
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

          {transcript && (
            <div className="w-full mt-4">
              <h3 className="text-lg font-bold">Transcript:</h3>
              <p className="text-sm">{transcript}</p>
            </div>
          )}

          {summary && (
            <div className="w-full mt-4">
              <h3 className="text-lg font-bold">Summary:</h3>
              <p className="text-sm">{summary}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
