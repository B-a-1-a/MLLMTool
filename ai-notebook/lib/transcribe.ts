import axios from "axios";

const GROQ_API_KEY = process.env.NEXT_PUBLIC_GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

// ✅ Now takes a **file URL** instead of a `File` object
export async function transcribeAudio(audioUrl: string): Promise<string> {
  try {
    console.log("Fetching audio for transcription from:", audioUrl);

    const response = await axios.post(
      GROQ_API_URL,
      {
        audio_url: audioUrl, // 🟢 Now sending file URL to API
        model: "whisper-large-v3-turbo",
        response_format: "json",
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.text;
  } catch (error: any) {
    console.error("Error transcribing audio:", error.response?.data || error.message);
    return `Error: ${error.response?.data?.error || "Failed to transcribe audio"}`;
  }
}
