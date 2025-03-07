"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, Mic, Share, ChevronRight } from "lucide-react"
import { SettingsDialog } from "../components/settings-dialog"
import { AddSourceDialog } from "../components/add-source-dialog"
import { useLanguage } from "../contexts/language-context"
import type { AudioSource } from "../types/audio";
import { fetchLLMResponse } from "@/lib/groqApi"; 

const INITIAL_SOURCES: AudioSource[] = [
  { id: "1", title: "Interview #1", type: "audio", duration: "12:34", path: "/audio1.mp3" },
  { id: "2", title: "Meeting Notes", type: "transcript", path: "/transcript1.txt" },
]

const SAMPLE_SUMMARY = {
  text: {
    en: "This is a discussion about artificial intelligence and its impact on modern society. The speakers explore various applications of AI in healthcare, education, and daily life.",
    es: "Esta es una discusión sobre la inteligencia artificial y su impacto en la sociedad moderna. Los oradores exploran varias aplicaciones de la IA en la salud, la educación y la vida diaria.",
  },
}

const SAMPLE_TRANSCRIPT = {
  en: `[Speaker 1]: Hello and welcome to our discussion about AI.
[Speaker 2]: Thank you for having me today.
[Speaker 1]: Let's start by talking about recent developments...`,
  es: `[Orador 1]: Hola y bienvenidos a nuestra discusión sobre IA.
[Orador 2]: Gracias por invitarme hoy.
[Orador 1]: Empecemos hablando sobre los desarrollos recientes...`,
}

export default function Notebook() {
  const [sources, setSources] = useState<AudioSource[]>(INITIAL_SOURCES);
  const [selectedSource, setSelectedSource] = useState<AudioSource | null>(null);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const { language } = useLanguage();

  const handleQuerySubmit = async () => {
    if (!query.trim()) return;
    
    setResponse("Processing..."); // Show loading state

    if (language === "en") {
      const result = await fetchLLMResponse(query);
      setResponse(result);
    } else {
      setResponse("LLM responses are only available in English.");
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Left Sidebar */}
      <div className="w-80 border-r p-4">
        <div className="flex flex-col h-full">
          <h2 className="text-lg mb-4">Sources</h2>
          <AddSourceDialog onAddSource={(newSource) => setSources([...sources, newSource])} />
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

      {/* Main Content */}
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
                <h3 className="font-semibold mb-4">Summary</h3>
                <p className="text-muted-foreground mb-4">{SAMPLE_SUMMARY.text[language]}</p>
                <div className="space-y-4"></div>
                <h3 className="font-semibold mb-4">Ask about this {selectedSource.type}</h3>
                <div className="relative">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={language === "en" ? "Ask a question..." : "Hacer una pregunta..."}
                    className="pr-24"
                  />
                  <Button
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={handleQuerySubmit}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Display Response */}
                {response && (
                  <div className="mt-4 p-4 border rounded bg-gray-100">
                    <p className="font-semibold">Response:</p>
                    <p>{response}</p>
                  </div>
                )}
              </Card>
            ) : (
              <div className="text-center text-muted-foreground">
                {language === "en"
                  ? "Select a source to view summary and transcript"
                  : "Seleccione una fuente para ver el resumen y la transcripción"}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right Sidebar - Transcript */}
      <div className="w-96 border-l p-4">
        <div className="flex flex-col h-full">
          <h2 className="text-lg mb-4">{language === "en" ? "Transcript" : "Transcripción"}</h2>
          <ScrollArea className="flex-1">
            {selectedSource ? (
              <div className="space-y-4 whitespace-pre-wrap">{SAMPLE_TRANSCRIPT[language]}</div>
            ) : (
              <div className="text-muted-foreground">
                {language === "en" ? "No source selected" : "Ninguna fuente seleccionada"}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}

