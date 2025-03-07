"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Plus } from "lucide-react"
import type { AudioSource } from "../types/audio"

interface AddSourceDialogProps {
  onAddSource: (source: AudioSource) => void
}

export function AddSourceDialog({ onAddSource }: AddSourceDialogProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [type, setType] = useState<"audio" | "transcript">("audio")
  const [path, setPath] = useState("")
  const [duration, setDuration] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const newSource: AudioSource = {
      id: Date.now().toString(), // Use a timestamp as a simple unique ID
      title,
      type,
      path,
      ...(type === "audio" && duration ? { duration } : {}),
    }
    onAddSource(newSource)
    setOpen(false)
    // Reset form
    setTitle("")
    setType("audio")
    setPath("")
    setDuration("")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="mb-4 justify-start gap-2">
          <Plus className="h-4 w-4" />
          Add source
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Source</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label>Type</Label>
            <RadioGroup value={type} onValueChange={(value: "audio" | "transcript") => setType(value)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="audio" id="audio" />
                <Label htmlFor="audio">Audio</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="transcript" id="transcript" />
                <Label htmlFor="transcript">Transcript</Label>
              </div>
            </RadioGroup>
          </div>
          <div>
            <Label htmlFor="path">File Path</Label>
            <Input id="path" value={path} onChange={(e) => setPath(e.target.value)} required />
          </div>
          {type === "audio" && (
            <div>
              <Label htmlFor="duration">Duration</Label>
              <Input
                id="duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="HH:MM:SS"
              />
            </div>
          )}
          <Button type="submit">Add Source</Button>

        </form>
      </DialogContent>
    </Dialog>
  )
}

