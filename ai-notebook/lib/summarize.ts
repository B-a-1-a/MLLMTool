import axios from "axios";

const GROQ_API_KEY = process.env.NEXT_PUBLIC_GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function summarizeTranscript(transcript: string): Promise<string> {
    try {
        console.log("Sending transcript to Groq API for summarization...");

        const response = await axios.post(
            GROQ_API_URL,
            {
                model: "llama-3.3-70b-versatile", // Ensure correct model
                messages: [
                    { role: "system", content: "You are an AI assistant specializing in summarizing conversations and transcripts." },
                    { role: "user", content: `Summarize this transcript concisely:\n\n${transcript}` },
                ],
                max_tokens: 300, // Adjust summary length
            },
            {
                headers: {
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("Summary result:", response.data);

        return response.data.choices[0].message.content;
    } catch (error: any) {
        console.error("Error summarizing transcript:", error.response?.data || error.message);
        return `Error: ${error.response?.data?.error || "Failed to generate summary"}`;
    }
}
