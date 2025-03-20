"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Mic, StopCircle } from "lucide-react";
import { uploadAudio, saveMetadata } from "@/lib/audioUploader";
import { transcribeAudio } from "@/lib/transcribe";
import { summarizeTranscript } from "@/lib/summarize";

export function RecordSourceDialog({ onAddSource }: { onAddSource: () => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
  
    setIsProcessing(true);
  
    try {
      // Convert Blob to File
      const file = new File([audioBlob], `recording-${Date.now()}.wav`, {
        type: "audio/wav",
        lastModified: Date.now(),
      });
  
      // 🟢 Step 1: Upload the file to Supabase
      const filePath = await uploadAudio(file);
      if (!filePath) {
        alert("Failed to upload audio");
        return;
      }
  
      // 🟢 Step 2: Save metadata in Supabase (initially empty transcript & summary)
      const metadata = await saveMetadata(filePath, file.name, "", "");
      if (!metadata) {
        alert("Failed to save metadata");
        return;
      }
  
      // 🟢 Step 3: Process transcription & summary in the background
      const transcriptText = await transcribeAudio(file); // Pass the File object
      const summaryText = await summarizeTranscript(transcriptText);
  
      // 🟢 Step 4: Update Supabase with the transcript & summary
      await saveMetadata(filePath, file.name, transcriptText, summaryText);
  
      // ✅ Refresh the list of recordings
      onAddSource();
    } catch (error) {
      console.error("Error processing recording:", error);
      alert("An error occurred while processing the recording.");
    } finally {
      setIsProcessing(false);
    }
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
              <Button onClick={saveRecording} className="mt-2 w-full" disabled={isProcessing}>
                {isProcessing ? "Saving..." : "Save Recording"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}