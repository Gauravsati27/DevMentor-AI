import { GoogleGenAI } from "@google/genai";
import { GeminiModel } from "../types";

// Initialize the client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateResponse = async (
  prompt: string, 
  image: string | undefined,
  systemInstruction: string,
  history: { role: string; parts: any[] }[] = []
): Promise<string> => {
  try {
    const model = GeminiModel.TEXT;
    
    const parts: any[] = [];
    
    // Add image if present
    if (image) {
      // image is expected to be a data URI: data:image/png;base64,....
      // We need to extract the base64 part and the mime type
      const match = image.match(/^data:(.+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2]
          }
        });
      }
    }

    // Add text prompt
    if (prompt) {
      parts.push({ text: prompt });
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: [
        ...history,
        { role: 'user', parts: parts }
      ],
      config: {
        systemInstruction: systemInstruction,
      }
    });

    return response.text || "No response generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to get response from DevMentor AI.");
  }
};