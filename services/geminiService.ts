import { GoogleGenAI, Modality, GenerateContentResponse, Type } from "@google/genai";
import { PromptData } from '../types';

if (!process.env.API_KEY) {
    console.warn("API_KEY environment variable not set. Using a placeholder. Please set your API key.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "YOUR_API_KEY_HERE" });

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};

const extractImageFromResponse = (response: GenerateContentResponse): string | null => {
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
            const mimeType = part.inlineData.mimeType;
            return `data:${mimeType};base64,${part.inlineData.data}`;
        }
    }
    return null;
}

export const generateImage = async (promptData: PromptData): Promise<string> => {
    // Combine the structured prompt data into a single, descriptive paragraph
    // suitable for the text-to-image generation model.
    const prompt = `${promptData.subject}, ${promptData.action}, ${promptData.environment}. In the style of ${promptData.style}, with ${promptData.lighting}, shot with a ${promptData.camera}.`;
    
    try {
        // Use the dedicated image generation model as per API guidelines.
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/png',
                aspectRatio: '1:1',
            },
        });

        if (!response.generatedImages || response.generatedImages.length === 0) {
            throw new Error("No image generated in response.");
        }

        const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
        // The API returns raw base64, so we need to prepend the data URI scheme.
        return `data:image/png;base64,${base64ImageBytes}`;

    } catch (error) {
        console.error("Error generating image:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("safety")) {
             throw new Error("Failed to generate image due to safety policy. Please adjust your prompt.");
        }
        throw new Error("Failed to generate image. Check console for details.");
    }
};

export const suggestFieldOptions = async (field: keyof PromptData, context: PromptData): Promise<string[]> => {
    const prompt = `You are a creative assistant for an image generation tool.
Given the scene described by the following JSON, suggest 5 creative and diverse options for the "${field}" field.
The current value is "${context[field]}". Do not suggest options too similar to the current value or each other.
Provide your response as a JSON array of 5 strings.

Scene Context:
${JSON.stringify(context, null, 2)}`;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        });
        const jsonStr = response.text.trim();
        const suggestions = JSON.parse(jsonStr);
        if (Array.isArray(suggestions) && suggestions.every(s => typeof s === 'string')) {
            return suggestions;
        }
        throw new Error("Invalid response format from AI suggestions.");
    } catch (error) {
         console.error("Error suggesting field options:", error);
        throw new Error("Failed to get AI suggestions. Check console for details.");
    }
};

export const editImage = async (base64Image: string, mimeType: string, changePrompt: string, keepPrompt: string): Promise<string> => {
    const prompt = `[System]
You are Nano Banana (Gemini 2.5 Flash Image).
Preserve photorealism and lighting consistency. Apply ONLY requested changes.

[User]
Task Type: edit
Constraints:
- Change only: ${changePrompt}
- Keep untouched: ${keepPrompt}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: {
                parts: [
                    { inlineData: { data: base64Image, mimeType } },
                    { text: prompt },
                ]
            },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        const imageUrl = extractImageFromResponse(response);
        if (!imageUrl) throw new Error("No image generated in response.");
        return imageUrl;
    } catch (error) {
        console.error("Error editing image:", error);
        throw new Error("Failed to edit image. Check console for details.");
    }
};

export const composeImages = async (images: {base64: string, mimeType: string}[], composePrompt: string): Promise<string> => {
    const prompt = `[System]
You are Nano Banana (Gemini 2.5 Flash Image).
Preserve photorealism and lighting consistency. Apply ONLY requested changes.

[User]
Task Type: compose
Instructions: ${composePrompt}
- Blend elements from the provided images with lighting match.`;

    const parts = [
        ...images.map(img => ({ inlineData: { data: img.base64, mimeType: img.mimeType } })),
        { text: prompt },
    ];

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        const imageUrl = extractImageFromResponse(response);
        if (!imageUrl) throw new Error("No image generated in response.");
        return imageUrl;
    } catch (error) {
        console.error("Error composing images:", error);
        throw new Error("Failed to compose images. Check console for details.");
    }
};

export const applyIterativeChange = async (base64Image: string, mimeType: string, change: string): Promise<string> => {
    const prompt = `[System]
You are Nano Banana (Gemini 2.5 Flash Image).
Preserve photorealism and lighting consistency. Apply ONLY the requested subtle change. Keep all subjects and compositions the same.

[User]
Task Type: edit
Instructions: ${change}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: {
                parts: [
                    { inlineData: { data: base64Image, mimeType } },
                    { text: prompt },
                ]
            },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        const imageUrl = extractImageFromResponse(response);
        if (!imageUrl) throw new Error("No image generated in response.");
        return imageUrl;
    } catch (error) {
        console.error("Error applying iterative change:", error);
        throw new Error("Failed to apply change. Check console for details.");
    }
};