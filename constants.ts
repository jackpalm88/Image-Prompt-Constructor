import { Tab, PromptData } from './types';

export const TABS = [
  { id: Tab.Generate, label: 'Generate' },
  { id: Tab.Edit, label: 'Edit' },
  { id: Tab.Compose, label: 'Compose' },
  { id: Tab.History, label: 'History' },
];

export const STYLE_PRESETS: { name: string; data: PromptData }[] = [
    {
        name: 'Product Mockup',
        data: {
            subject: 'A modern, sleek product bottle',
            action: 'placed on a clean surface',
            environment: 'in a brightly lit studio setting with a seamless white background',
            style: 'photorealistic product mockup, high resolution, 4K, commercial quality',
            lighting: 'soft, even studio lighting, consistent shadows, high contrast',
            camera: 'eye-level shot, 85mm lens, sharp focus on the product',
        },
    },
    {
        name: 'Cinematic Portrait',
        data: {
            subject: 'A mysterious person in a trench coat',
            action: 'standing under a single streetlamp',
            environment: 'on a rain-slicked city street at night',
            style: 'cinematic, film noir, dramatic, moody',
            lighting: 'strong key light from the streetlamp, deep shadows, atmospheric haze',
            camera: 'low-angle shot, 35mm lens, anamorphic style',
        },
    },
    {
        name: 'Fantasy Landscape',
        data: {
            subject: 'A colossal, ancient tree with glowing runes',
            action: 'standing in the middle of a misty valley',
            environment: 'surrounded by floating islands and waterfalls under a twin-moon sky',
            style: 'epic fantasy art, digital painting, highly detailed, vibrant colors',
            lighting: 'ethereal, magical glow from the runes and moons, volumetric lighting',
            camera: 'ultra-wide angle shot, panoramic view, establishing shot',
        },
    },
];

export const QUICK_SELECT_OPTIONS: Record<keyof PromptData, string[]> = {
    subject: [
        'A futuristic cyborg detective',
        'A group of adorable capybaras',
        'An ancient, moss-covered golem',
        'A solitary astronaut on a red planet',
        'A mythical phoenix rising from ashes',
    ],
    action: [
        'sipping tea in a floating garden',
        'navigating a bustling neon-lit market',
        'discovering a hidden, ancient library',
        'casting a powerful spell',
        'gazing at a binary sunset',
    ],
    environment: [
        'in a cyberpunk city with flying cars',
        'within a tranquil, enchanted forest',
        'on a colossal space station orbiting a gas giant',
        'in a post-apocalyptic wasteland',
        'inside a whimsical, candy-themed world',
    ],
    style: [
        'hyperrealistic, 8k, detailed',
        'impressionistic, painterly, soft focus',
        'minimalist, clean, pastel colors',
        'vintage, grainy film look, sepia tones',
        'cyberpunk, neon lights, dark tones',
    ],
    lighting: [
        'dramatic backlighting, lens flare',
        'soft, diffused morning light',
        'hard, direct overhead sunlight',
        'eerie, bioluminescent glow from plants',
        'warm, flickering candlelight',
    ],
    camera: [
        'wide-angle lens, low-angle shot',
        'telephoto lens, blurred background, bokeh',
        'drone shot, aerial top-down view',
        'dutch angle, creating a sense of unease',
        'macro shot, extreme close-up',
    ]
};