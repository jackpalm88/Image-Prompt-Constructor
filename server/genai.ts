import { GoogleGenAI, Modality, type GenerateContentResponse } from '@google/genai';
import { GenerateImagePayload, ImagePayload, PromptData } from './types';

const apiKey = process.env.API_KEY;
if (!apiKey) {
  // eslint-disable-next-line no-console
  console.warn('API_KEY not set. GoogleGenAI functionality will be unavailable.');
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const buildPrompt = (prompt: PromptData) =>
  `${prompt.subject}, ${prompt.action}, ${prompt.environment}. In the style of ${prompt.style}, with ${prompt.lighting}, shot with a ${prompt.camera}.`;

const toInlineData = (image?: ImagePayload | null) =>
  image
    ? {
        inlineData: {
          data: image.base64,
          mimeType: image.mimeType,
        },
      }
    : null;

const extractImageFromResponse = (response: GenerateContentResponse) => {
  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType ?? 'image/png';
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }
  return null;
};

export const generateImageFromGemini = async ({
  promptData,
  subjectImage,
  environmentImage,
}: GenerateImagePayload) => {
  if (!ai) {
    throw new Error('Image generation service is not configured');
  }

  const prompt = buildPrompt(promptData);

  if (subjectImage || environmentImage) {
    const parts = [toInlineData(subjectImage), toInlineData(environmentImage), { text: prompt }]
      .filter(Boolean) as Array<Record<string, unknown>>;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    const imageUrl = extractImageFromResponse(response);
    if (!imageUrl) {
      const textResponse = response.text?.trim();
      throw new Error(textResponse || 'No image generated in response');
    }

    return { imageUrl, prompt };
  }

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt,
    config: {
      numberOfImages: 1,
      outputMimeType: 'image/png',
      aspectRatio: '1:1',
    },
  });

  const imageData = response.images?.[0]?.data ?? response.data?.[0]?.b64Json;
  if (!imageData) {
    throw new Error('No image data returned');
  }

  const imageUrl = `data:image/png;base64,${imageData}`;
  return { imageUrl, prompt };
};
