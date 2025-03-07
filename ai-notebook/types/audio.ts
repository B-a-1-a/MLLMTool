export type Language = "en" | "es"

export interface AudioSource {
  id: string
  title: string
  type: "audio" | "transcript"
  duration?: string
  path: string
}

export interface Summary {
  text: {
    en: string
    es: string
  }
}

