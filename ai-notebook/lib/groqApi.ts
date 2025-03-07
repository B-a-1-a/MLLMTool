import axios from "axios";

const GROQ_API_KEY = process.env.NEXT_PUBLIC_GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"; // Corrected URL

export async function fetchLLMResponse(prompt: string) {
    try {
        console.log("Sending request to Groq API...");
        const response = await axios.post(
            GROQ_API_URL,
            {
                model: "llama-3.3-70b-versatile", // Ensure model name is correct
                messages: [
                    { role: "system", content: "You are an AI assistant." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 500,
            },
            {
                headers: {
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log("Groq API response:", response.data);
        return response.data.choices[0].message.content;
    } catch (error: any) {
        console.error("Error fetching LLM response:", error.response?.data || error.message);
        return `Error: ${error.response?.data?.error || "Failed to fetch response"}`;
    }
}
