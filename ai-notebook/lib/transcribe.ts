import axios from "axios";

const GROQ_API_KEY = process.env.NEXT_PUBLIC_GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export async function transcribeAudio(audioFile: File): Promise<string> {
    try {
        console.log("Uploading audio file for transcription...");

        // Prepare the form data
        const formData = new FormData();
        formData.append("file", audioFile);
        formData.append("model", "whisper-large-v3-turbo"); // Ensure model is correct
        formData.append(
            "prompt",
            "Two languages coming in, code-switching between English and Spanish. Transcribe the audio as is, returning Spanish when they are speaking Spanish and English when they are speaking English."
        );
        formData.append("response_format", "json");

        // Send request to Groq API
        const response = await axios.post(GROQ_API_URL, formData, {
            headers: {
                Authorization: `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "multipart/form-data",
            },
        });

        console.log("Transcription result:", response.data);

        return response.data.text; // The transcribed text
    } catch (error: any) {
        console.error("Error transcribing audio:", error.response?.data || error.message);
        return `Error: ${error.response?.data?.error || "Failed to transcribe audio"}`;
    }
}
