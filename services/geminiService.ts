

import { GoogleGenAI, Modality, GenerateContentResponse, Type } from "@google/genai";
import { PromptData, ImageFile, Template } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

export const generateImage = async (promptData: PromptData, subjectImage: ImageFile | null, environmentImage: ImageFile | null): Promise<string> => {
    const fullPrompt = `${promptData.subject}, ${promptData.action}, ${promptData.environment}. In the style of ${promptData.style}, with ${promptData.lighting}, shot with a ${promptData.camera}.`;

    // If any image is provided, use the multi-modal model
    if (subjectImage || environmentImage) {
        const parts: any[] = [];
        
        if (subjectImage) {
            parts.push({ inlineData: { data: subjectImage.base64, mimeType: subjectImage.file.type } });
        }
        if (environmentImage) {
            parts.push({ inlineData: { data: environmentImage.base64, mimeType: environmentImage.file.type } });
        }
        
        parts.push({ text: fullPrompt });
        
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: { parts },
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            });
            const imageUrl = extractImageFromResponse(response);
            if (!imageUrl) {
                const textResponse = response.text?.trim();
                console.error("Image generation failed. Model may have responded with only text:", textResponse || "No text response.");
                console.error("Full model response object for debugging:", response);
                throw new Error("No image generated in response. The model may have refused the request. See console for full response details.");
            }
            return imageUrl;
        } catch (error) {
            console.error("Error generating image with reference(s):", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes("safety")) {
                 throw new Error("Failed to generate image due to safety policy. Please adjust your prompt.");
            }
            if (errorMessage.startsWith("No image generated")) {
                throw error;
            }
            throw new Error("Failed to generate image. Check console for details.");
        }

    } else {
        // Use standard text-to-image generation if no images are provided
        try {
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: fullPrompt,
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
            return `data:image/png;base64,${base64ImageBytes}`;

        } catch (error) {
            console.error("Error generating image:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes("safety")) {
                 throw new Error("Failed to generate image due to safety policy. Please adjust your prompt.");
            }
            throw new Error("Failed to generate image. Check console for details.");
        }
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

const PROMPT_IDEA_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        subject: { type: Type.STRING, description: "A detailed description of the main subject of the scene." },
        action: { type: Type.STRING, description: "The action the subject is performing." },
        environment: { type: Type.STRING, description: "A detailed description of the background and environment." },
        style: { type: Type.STRING, description: "The artistic style of the image (e.g., photorealistic, impressionistic, cyberpunk)." },
        lighting: { type: Type.STRING, description: "The lighting conditions of the scene (e.g., golden hour, neon glow, dramatic backlighting)." },
        camera: { type: Type.STRING, description: "The camera angle, shot type, or lens used (e.g., low-angle shot, wide-angle lens, drone shot)." }
    },
    required: ["subject", "action", "environment", "style", "lighting", "camera"]
};

export const generateFullPromptIdea = async (subjectImage: ImageFile | null, environmentImage: ImageFile | null): Promise<PromptData> => {
    const parts: any[] = [];
    let promptText = "You are a creative assistant for an image generation tool. Generate a full, creative, and coherent scene idea by filling out all fields in the provided JSON schema. The scene should be imaginative and visually interesting.\n\n";

    if (subjectImage && environmentImage) {
        promptText += "The user has provided two images. The first is the subject, the second is a style reference for the environment. Create a prompt that places the subject into a scene inspired by the environment reference. Base your descriptions on these images.";
        parts.push({ inlineData: { data: subjectImage.base64, mimeType: subjectImage.file.type } });
        parts.push({ inlineData: { data: environmentImage.base64, mimeType: environmentImage.file.type } });
    } else if (subjectImage) {
        promptText += "The user has provided an image of a subject. Create a prompt that places this subject into a new, interesting scene. Base your subject description on this image.";
        parts.push({ inlineData: { data: subjectImage.base64, mimeType: subjectImage.file.type } });
    } else if (environmentImage) {
        promptText += "The user has provided a reference image for an environment. Create a prompt for a new scene inspired by the style and mood of this image.";
        parts.push({ inlineData: { data: environmentImage.base64, mimeType: environmentImage.file.type } });
    } else {
        promptText += "Generate a completely new and random scene idea.";
    }

    parts.push({ text: promptText });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts },
            config: {
                responseMimeType: "application/json",
                responseSchema: PROMPT_IDEA_SCHEMA
            }
        });
        const jsonStr = response.text.trim();
        const idea = JSON.parse(jsonStr);
        if (typeof idea === 'object' && idea !== null && 'subject' in idea && 'action' in idea && 'environment' in idea && 'style' in idea && 'lighting' in idea && 'camera' in idea) {
             return idea as PromptData;
        }
        throw new Error("Invalid response format from AI idea generation.");
    } catch (error) {
         console.error("Error generating full prompt idea:", error);
        throw new Error("Failed to get AI inspiration. Check console for details.");
    }
};

export const remixPromptIdea = async (currentPrompt: PromptData, lockedFields: Record<keyof PromptData, boolean>, remixHint?: string): Promise<PromptData> => {
    const lockedEntries = Object.entries(lockedFields)
        .filter(([, isLocked]) => isLocked)
        .map(([key]) => key as keyof PromptData);

    let promptText = `You are a creative assistant for an image generation tool.
You will be given a JSON object describing an existing scene.
Your task is to generate a new, creative, and coherent scene idea that is a variation or continuation of the original.
For example, you could change the time of day, the camera angle, the subject's action, or describe what happens next in the story.
Do not just copy the original prompt. Create something new inspired by it.
Fill out all fields in the provided JSON schema.

Original Scene:
${JSON.stringify(currentPrompt, null, 2)}`;

    if (lockedEntries.length > 0) {
        promptText += `\n\nIMPORTANT: The following fields are locked and their values MUST NOT be changed. Use the exact values provided in the "Original Scene" for these fields:\n- ${lockedEntries.join('\n- ')}`;
    }

    if (remixHint?.trim()) {
        promptText += `\n\nADDITIONAL INSTRUCTION: When generating the new scene, incorporate this specific hint: "${remixHint.trim()}"`;
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptText,
            config: {
                responseMimeType: "application/json",
                responseSchema: PROMPT_IDEA_SCHEMA,
            }
        });
        const jsonStr = response.text.trim();
        const idea = JSON.parse(jsonStr);
        if (typeof idea === 'object' && idea !== null && 'subject' in idea && 'action' in idea && 'environment' in idea && 'style' in idea && 'lighting' in idea && 'camera' in idea) {
             return idea as PromptData;
        }
        throw new Error("Invalid response format from AI idea remixing.");
    } catch (error) {
         console.error("Error remixing prompt idea:", error);
        throw new Error("Failed to get AI remix. Check console for details.");
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

const BULK_PROMPT_ITEM_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING, description: "A short, descriptive title for the preset, e.g., 'Cyberpunk Detective'." },
        category: { type: Type.STRING, description: "A single, relevant category for this prompt, e.g., 'Sci-Fi', 'Nature', 'Portraits'." },
        tags: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING }, 
            description: "An array of 2-4 relevant keywords (tags) for searching, e.g., ['neon', 'city', 'dystopian']." 
        },
        subject: { type: Type.STRING, description: "A detailed description of the main subject of the scene." },
        action: { type: Type.STRING, description: "The action the subject is performing." },
        environment: { type: Type.STRING, description: "A detailed description of the background and environment." },
        style: { type: Type.STRING, description: "The artistic style of the image (e.g., photorealistic, impressionistic, cyberpunk)." },
        lighting: { type: Type.STRING, description: "The lighting conditions of the scene (e.g., golden hour, neon glow, dramatic backlighting)." },
        camera: { type: Type.STRING, description: "The camera angle, shot type, or lens used (e.g., low-angle shot, wide-angle lens, drone shot)." }
    },
    required: ["name", "category", "tags", "subject", "action", "environment", "style", "lighting", "camera"]
};

const BULK_PROMPT_SCHEMA = {
    type: Type.ARRAY,
    items: BULK_PROMPT_ITEM_SCHEMA
};

export type ParsedBulkPrompt = Omit<Template, 'id' | 'favorite' | 'pinned' | 'usageCount' | 'lastUsed' | 'createdAt' | 'updatedAt'>;

export const parseBulkPrompts = async (rawText: string): Promise<ParsedBulkPrompt[]> => {
    const prompt = `You are an expert prompt engineering assistant.
Analyze the following block of text, which contains multiple distinct image generation prompts, each separated by a newline.
For each individual prompt line, parse its content into a structured JSON object with the required fields.
- The 'name' field should be a short, descriptive title for the preset (e.g., 'Cyberpunk Detective', 'Fantasy Landscape').
- The 'category' field should be a single, relevant category.
- The 'tags' field should be an array of 2-4 relevant keywords.
- The other six fields should break down the prompt into its constituent parts.
Return a single JSON array containing all the parsed prompt objects.

Input Text:
---
${rawText}
---
`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: BULK_PROMPT_SCHEMA,
            }
        });
        
        const jsonStr = response.text.trim();
        const parsedData = JSON.parse(jsonStr);

        if (Array.isArray(parsedData)) {
            return parsedData;
        }
        throw new Error("AI response was not an array.");
    } catch (error) {
        console.error("Error parsing bulk prompts:", error);
        throw new Error("Failed to parse prompts with AI. Check console for details.");
    }
};