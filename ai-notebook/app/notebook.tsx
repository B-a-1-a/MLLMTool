"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Mic, Share, ChevronRight, Upload } from "lucide-react";
import { SettingsDialog } from "../components/settings-dialog";
import { useLanguage } from "../contexts/language-context";
import type { AudioSource } from "../types/audio";
import { fetchLLMResponse } from "@/lib/groqApi";
import { RecordSourceDialog } from "@/components/record-source-dialog";
import { transcribeAudio } from "@/lib/transcribe";
import { summarizeTranscript } from "@/lib/summarize";
import CustomPDFViewer from "@/components/CustomPDFViewer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { fetchLatestRecordings } from "@/lib/audioUploader";
import { supabase } from "@/lib/supabaseClient";

// Define interfaces for API response
interface Highlight {
  index: number;
  text: string;
  score: number;
}

interface MergedHighlight {
  start_index: number;
  end_index: number;
  text: string;
  avg_score: number;
}

interface QueryResponse {
  answer: string;
  confidence: number;
  highlights: Highlight[];
  merged_highlights: MergedHighlight[];
}

// Helper function to query the backend API
async function queryBackend(question: string, context: string): Promise<QueryResponse> {
  try {
    const response = await fetch('http://localhost:8000/api/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        context,
        threshold: 0.7,
        max_highlight_sentences: 3 // Allow up to 3 sentences to be highlighted
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error querying backend:', error);
    throw error;
  }
}

// Extend AudioSource type to include PDF sources
interface Source {
  id: string;
  title: string;
  type: "audio" | "pdf";
  duration?: string;
  path: string;
  file?: File;
  transcript?: string;
  summary?: string;
}

// Interface to store cached data for each source
interface SourceCache {
  [sourceId: string]: {
    transcript?: string;
    summary?: string;
    textContent?: string;
  }
}

const Notebook = () => {
  const [sources, setSources] = useState<Source[]>([]); // Initialize with an empty array
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const { language } = useLanguage();
  const [textContent, setTextContent] = useState<string>("");
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedSources, setProcessedSources] = useState<Set<string>>(new Set());
  const [sourceCache, setSourceCache] = useState<SourceCache>({});

  // Fetch recordings when the component mounts
  useEffect(() => {
    fetchRecordings();
  }, []);

  // Fetch recordings from Supabase
  const fetchRecordings = async () => {
    const recordings = await fetchLatestRecordings();
    if (recordings) {
      // Map the recordings to match the Source type
      const formattedRecordings = recordings.map((recording) => ({
        id: recording.id,
        title: recording.title,
        type: recording.type,
        duration: recording.duration,
        path: recording.file_url, // Map file_url to path
        transcript: recording.transcript,
        summary: recording.summary,
      }));
      setSources(formattedRecordings);
    }
  };

  // Add a function to get text content from PDF viewer and cache it
  const setPDFTextContent = (content: string) => {
    if (!selectedSource) return;
    
    setTextContent(content);
    
    // Update cache with the new text content
    setSourceCache(prev => ({
      ...prev,
      [selectedSource.id]: {
        ...prev[selectedSource.id],
        textContent: content
      }
    }));
    
    // Save to localStorage
    try {
      localStorage.setItem(`source_textContent_${selectedSource.id}`, content);
    } catch (error) {
      console.warn('Could not save PDF text content to localStorage:', error);
    }
  };

  // Load cache from localStorage on component mount
  useEffect(() => {
    try {
      // Load processed sources from localStorage
      const savedProcessedSources = localStorage.getItem('processedSources');
      if (savedProcessedSources) {
        setProcessedSources(new Set(JSON.parse(savedProcessedSources)));
      }
      
      // Load source cache data
      const tempCache: SourceCache = {};
      
      // Scan all localStorage items for our cache keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        
        if (key.startsWith('source_transcript_')) {
          const sourceId = key.replace('source_transcript_', '');
          tempCache[sourceId] = tempCache[sourceId] || {};
          tempCache[sourceId].transcript = localStorage.getItem(key) || undefined;
        } else if (key.startsWith('source_summary_')) {
          const sourceId = key.replace('source_summary_', '');
          tempCache[sourceId] = tempCache[sourceId] || {};
          tempCache[sourceId].summary = localStorage.getItem(key) || undefined;
        } else if (key.startsWith('source_textContent_')) {
          const sourceId = key.replace('source_textContent_', '');
          tempCache[sourceId] = tempCache[sourceId] || {};
          tempCache[sourceId].textContent = localStorage.getItem(key) || undefined;
        }
      }
      
      setSourceCache(tempCache);
    } catch (error) {
      console.warn('Error loading cache from localStorage:', error);
    }
  }, []);

  const fetchTranscriptAndSummary = async (source: Source) => {
    if (source.type !== "audio") return;
    
    // Check if we've already processed this source
    if (processedSources.has(source.id)) {
      // Use cached data if available
      if (sourceCache[source.id]?.transcript) {
        setTranscript(sourceCache[source.id].transcript || null);
      } else {
        setTranscript("Transcript unavailable.");
      }
      
      if (sourceCache[source.id]?.summary) {
        setSummary(sourceCache[source.id].summary || null);
      } else {
        setSummary("Summary unavailable.");
      }
      
      return;
    }
    
    setTranscript("Fetching transcript...");
    setSummary("Generating summary...");

    try {
        // Convert Blob URL to File
        let audioFile: File | null = null;
        if (source.path.startsWith("blob:")) {
            const response = await fetch(source.path);
            const blob = await response.blob();
            audioFile = new File([blob], "audio.wav", { type: "audio/wav" });
        }

        if (audioFile) {
            const transcribedText = await transcribeAudio(audioFile);
            setTranscript(transcribedText);
            
            // Cache the transcript
            setSourceCache(prev => ({
              ...prev,
              [source.id]: {
                ...prev[source.id],
                transcript: transcribedText
              }
            }));
            
            // Save to localStorage
            try {
              localStorage.setItem(`source_transcript_${source.id}`, transcribedText);
            } catch (error) {
              console.warn('Could not save transcript to localStorage:', error);
            }

            // Generate summary from the transcribed text
            const summaryText = await summarizeTranscript(transcribedText);
            setSummary(summaryText);
            
            // Cache the summary
            setSourceCache(prev => ({
              ...prev,
              [source.id]: {
                ...prev[source.id],
                summary: summaryText
              }
            }));
            
            // Save to localStorage
            try {
              localStorage.setItem(`source_summary_${source.id}`, summaryText);
            } catch (error) {
              console.warn('Could not save summary to localStorage:', error);
            }
        } else {
            setTranscript("Failed to load audio file for transcription.");
            setSummary("Could not generate summary.");
        }
        
        // Mark this source as processed
        const newProcessedSources = new Set(processedSources);
        newProcessedSources.add(source.id);
        setProcessedSources(newProcessedSources);
        
        // Save processed sources to localStorage
        try {
          localStorage.setItem('processedSources', JSON.stringify([...newProcessedSources]));
        } catch (error) {
          console.warn('Could not save processed sources to localStorage:', error);
        }
    } catch (error) {
        setTranscript("Error transcribing audio.");
        setSummary("Error generating summary.");
        console.error(error);
    }
  };
  
  // Handle source selection
  useEffect(() => {
    if (!selectedSource) return;
    
    // Reset highlights when changing sources
    setHighlights([]);
    
    if (selectedSource.type === "audio") {
      setAudioPlayer(new Audio(selectedSource.path));
      
      // Check if we have cached data for this source
      if (sourceCache[selectedSource.id]) {
        const cachedData = sourceCache[selectedSource.id];
        
        if (cachedData.transcript) {
          setTranscript(cachedData.transcript);
        } else {
          // Only fetch if no cache exists
          fetchTranscriptAndSummary(selectedSource);
        }
        
        if (cachedData.summary) {
          setSummary(cachedData.summary);
        }
      } else {
        // No cache exists, fetch the data
        fetchTranscriptAndSummary(selectedSource);
      }
    } else if (selectedSource.type === "pdf") {
      // Clear audio-specific states when PDF is selected
      setAudioPlayer(null);
      setTranscript(null);
      setSummary(null);
      
      // Check for cached PDF text content
      if (sourceCache[selectedSource.id]?.textContent) {
        setTextContent(sourceCache[selectedSource.id].textContent || "");
      } else {
        setTextContent("");
      }
    }
  }, [selectedSource, sourceCache, processedSources]);

  const handleQuerySubmit = async () => {
    if (!query.trim() || !selectedSource) return;
  
    setResponse("Processing...");
    setIsProcessing(true);
    setHighlights([]);
  
    try {
      // Check language
      if (language !== "en") {
        setResponse("Queries are only available in English at this time.");
        setIsProcessing(false);
        return;
      }
  
      // Get context based on source type
      let context = "";
      if (selectedSource.type === "audio") {
        context = transcript || "";
      } else if (selectedSource.type === "pdf") {
        context = textContent || "";
      }
  
      if (!context) {
        setResponse("Unable to extract content from the selected source.");
        setIsProcessing(false);
        return;
      }
  
      // Call Groq LLM API with context (independent of backend API)
      const llmPromise = fetchLLMResponse(`Question: ${query}\n\nContext from ${selectedSource.type}: ${context.substring(0, 2000)}...`);
  
      let fullResponse = "";
      let apiResponse: QueryResponse | null = null;
  
      // Try to get the backend API response, but continue even if it fails
      try {
        apiResponse = await queryBackend(query, context);
        fullResponse = apiResponse.answer;
  
        // Store highlights for potential visualization
        if (apiResponse && apiResponse.highlights && apiResponse.highlights.length > 0) {
          setHighlights(apiResponse.highlights);
  
          // Only add highlights to response if they're different from the main answer
          if (apiResponse && apiResponse.highlights && apiResponse.highlights.length > 0) {
            setHighlights(apiResponse.highlights);
          
            // Only add highlights to response if they're different from the main answer
            if (apiResponse.merged_highlights && apiResponse.merged_highlights.length > 0) {
              // Store apiResponse.answer in a variable to avoid null issues
              const answer = apiResponse.answer;
          
              // Filter out any highlights that are identical to the main answer
              const uniqueHighlights = apiResponse.merged_highlights.filter(h => 
                h.text.trim() !== answer.trim()
              );
          
              if (uniqueHighlights.length > 0) {
                const highlightTexts = uniqueHighlights.map(h => 
                  `· ${h.text} (confidence: ${Math.min((h.avg_score * 100), 99).toFixed(0)}%)`
                );
                fullResponse += `\n\nRelevant passages:\n${highlightTexts.join('\n\n')}`;
              }
            }
          }
        }
      } catch (backendError) {
        console.error('Backend API error:', backendError);
        fullResponse = "Error retrieving information from the backend API. ";
      }
  
      // Wait for LLM response and add it to the full response
      try {
        const llmResponse = await llmPromise;
        // Add the LLM response as a separate section
        fullResponse += `\n\nChatbot Response:\n${llmResponse}`;
      } catch (llmError) {
        console.error('LLM API error:', llmError);
        fullResponse += `\n\nChatbot Response:\nUnable to retrieve response from the language model.`;
      }
  
      setResponse(fullResponse);
    } catch (error) {
      console.error('Query submission error:', error);
      setResponse(`An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const file = files[0];
    setUploadFile(file);
    
    // Auto-generate title from filename if no title entered
    if (!uploadTitle) {
      setUploadTitle(file.name.split('.').slice(0, -1).join('.'));
    }
  };

  const handleUploadSubmit = () => {
    if (!uploadFile || !uploadTitle.trim()) return;

    try {
      // Create a blob URL for the file
      const url = URL.createObjectURL(uploadFile);
      
      // Determine the file type
      const isPdf = uploadFile.type === 'application/pdf' || 
                   uploadFile.name.toLowerCase().endsWith('.pdf');
      
      const newSource: Source = {
        id: `uploaded-${Date.now()}`,
        title: uploadTitle,
        type: isPdf ? 'pdf' : 'audio',
        path: url,
        file: uploadFile,
        duration: !isPdf ? '00:00' : undefined
      };

      setSources(prev => [...prev, newSource]);
      setSelectedSource(newSource);
      
      // Reset the upload form
      setUploadTitle("");
      setUploadFile(null);
      setIsUploadDialogOpen(false);
    } catch (err) {
      console.error("Error adding source:", err);
    }
  };

  // Clean up blob URLs when component unmounts
  useEffect(() => {
    return () => {
      sources.forEach(source => {
        if (source.path.startsWith('blob:')) {
          URL.revokeObjectURL(source.path);
        }
      });
    };
  }, [sources]);

  return (
    <div className="flex h-screen bg-background text-foreground">
      
      {/* Left Sidebar */}
      <div className="w-80 border-r p-4">
        <div className="flex flex-col h-full">
          <h2 className="text-lg mb-4">Sources</h2>
          <div className="flex flex-col gap-2 mb-4">
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  {language === "en" ? "Upload File" : "Subir Archivo"}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>
                    {language === "en" ? "Upload File" : "Subir Archivo"}
                  </DialogTitle>
                  <DialogDescription>
                    {language === "en" 
                      ? "Upload an audio file or PDF document" 
                      : "Sube un archivo de audio o un documento PDF"}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">
                      {language === "en" ? "Title" : "Título"}
                    </Label>
                    <Input
                      id="title"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder={language === "en" ? "Enter title" : "Ingrese título"}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="file">
                      {language === "en" ? "File" : "Archivo"}
                    </Label>
                    <Input
                      id="file"
                      type="file"
                      accept="audio/*,application/pdf,.pdf"
                      onChange={handleFileUpload}
                    />
                  </div>

                  {uploadFile && (
                    <div className="flex items-center gap-2 p-2 bg-muted rounded">
                      <div className="overflow-hidden">
                        <div className="font-medium text-sm">{uploadFile.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    type="submit"
                    onClick={handleUploadSubmit}
                    disabled={!uploadTitle || !uploadFile}
                  >
                    {language === "en" ? "Upload" : "Subir"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            <RecordSourceDialog onAddSource={(newSource) => {
              setSources(prev => [...prev, newSource]);
              setSelectedSource(newSource);
            }} />
          </div>
            
          <div className="space-y-2">
            {sources.map((source) => (
              <div
                key={source.id}
                className={`flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer ${
                  selectedSource?.id === source.id ? "bg-muted" : ""
                }`}
                onClick={() => setSelectedSource(source)}
              >
                {source.type === "audio" ? (
                  <Mic className="h-4 w-4 text-primary" />
                ) : (
                  <FileText className="h-4 w-4 text-primary" />
                )}
                <div className="flex-1">
                  <div>{source.title}</div>
                  {source.duration && <div className="text-xs text-muted-foreground">{source.duration}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content - Audio & Summary */}
      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-4">
            <h1 className="text-xl">Audio Notebook</h1>
            {selectedSource && <span className="text-sm text-muted-foreground">{selectedSource.title}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <Share className="h-5 w-5" />
            </Button>
            <SettingsDialog />
          </div>
        </header>

        <ScrollArea className="flex-1 p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {selectedSource ? (
              <Card className="p-6">
                {/* Audio Player (Only show for audio sources) */}
                {selectedSource.type === "audio" && (
                  <>
                    <h3 className="font-semibold mb-4">Audio Playback</h3>
                    {audioPlayer ? (
                      <audio controls src={selectedSource.path} className="w-full" />
                    ) : (
                      <p className="text-muted-foreground">Select an audio source to play.</p>
                    )}

                    {/* Summary Section */}
                    <h3 className="font-semibold mt-6 mb-4">Summary</h3>
                    <p className="text-muted-foreground">
                      {summary || "Generating summary..."}
                    </p>
                  </>
                )}

                {/* Query Section */}
                <h3 className="font-semibold mt-6 mb-4">
                  {selectedSource.type === "audio" 
                    ? "Ask about this Audio" 
                    : "Ask about this Document"}
                </h3>
                <div className="relative">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={language === "en" ? "Ask a question..." : "Hacer una pregunta..."}
                    className="pr-24"
                    onKeyPress={(e) => e.key === 'Enter' && handleQuerySubmit()}
                  />
                  <Button
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={handleQuerySubmit}
                    disabled={isProcessing || !query.trim()}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Display Response */}
                {response && (
                  <div className="mt-4 p-4 border rounded bg-gray-100 whitespace-pre-line">
                    <p className="font-semibold">Response:</p>
                    <p>{response}</p>
                  </div>
                )}
              </Card>
            ) : (
              <div className="text-center text-muted-foreground">
                {language === "en"
                  ? "Select a source to view summary and content"
                  : "Seleccione una fuente para ver el resumen y el contenido"}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right Sidebar - Transcript or PDF Viewer */}
      <div className="w-96 border-l p-4">
        <div className="flex flex-col h-full">
          <h2 className="text-lg mb-4">
            {language === "en" ? "Transcript" : "Transcripción"}
          </h2>
          <div className="flex-1">
            {selectedSource ? (
              <>
                {selectedSource.type === "audio" ? (
                  <ScrollArea className="h-full">
                    <div className="space-y-4 whitespace-pre-wrap text-muted-foreground">
                      {transcript || "Fetching transcript..."}
                    </div>
                  </ScrollArea>
                ) : selectedSource.type === "pdf" ? (
                  <div className="h-full">
                    <CustomPDFViewer 
                      file={selectedSource.path} 
                      onTextContentChange={setPDFTextContent} 
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-muted-foreground">
                {language === "en" ? "No source selected" : "Ninguna fuente seleccionada"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notebook;