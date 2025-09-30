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
    {
        name: 'Urban Street Rider',
        data: {
            subject: 'A man with a futuristic motorcycle',
            action: 'posing on the street',
            environment: 'on a neon-lit cyberpunk street at night with flying vehicles',
            style: 'futuristic, realistic details, cinematic style, blade runner aesthetic',
            lighting: 'cinematic lighting from neon signs, high contrast, reflections on wet pavement',
            camera: 'eye-level shot, 50mm lens, shallow depth of field',
        },
    },
    {
        name: 'Adventure Vibes',
        data: {
            subject: 'A man sitting on an adventure bike',
            action: 'looking out over a vast landscape',
            environment: 'on a mountain cliff at sunrise, with foggy valleys in the background',
            style: 'epic adventure photography, dramatic tones, cinematic, matte painting',
            lighting: 'warm sunrise light, soft glow, long shadows, lens flare',
            camera: 'wide-angle shot, capturing the vast landscape, drone shot',
        },
    },
    {
        name: 'Classic Rider Aesthetic',
        data: {
            subject: 'A man with a classic retro motorcycle',
            action: 'leaning against his bike on a sidewalk',
            environment: 'on a city street with a 1970s vibe, vintage storefronts',
            style: 'vintage photo, sepia tone, soft film grain, 1970s aesthetic',
            lighting: 'natural, slightly faded afternoon sunlight, warm tones',
            camera: '35mm film camera look, eye-level, slightly off-center composition',
        },
    },
    {
        name: 'Luxury Look',
        data: {
            subject: 'A biker in a sleek leather jacket with a high-end sports bike',
            action: 'standing confidently next to the bike',
            environment: 'in front of modern, illuminated skyscrapers at night',
            style: 'luxury lifestyle photography, polished, high-end commercial look, ultra-realistic',
            lighting: 'golden reflections from city lights and buildings, slick and glossy highlights',
            camera: 'medium shot, 85mm portrait lens, sharp focus on subject and bike',
        },
    },
    {
        name: 'Instagram Reel Ready',
        data: {
            subject: 'A stylish man leaning casually on his modern bike',
            action: 'looking away from the camera with a thoughtful expression',
            environment: 'parked under streetlights on a city street at night',
            style: 'cinematic portrait, moody tones, shallow depth of field, viral Instagram reel aesthetic',
            lighting: 'soft, atmospheric light from streetlights, beautiful bokeh from distant city lights',
            camera: 'portrait orientation, 50mm f/1.8 lens, close-up shot',
        },
    },
    {
        name: 'Nature Escape',
        data: {
            subject: 'A man riding a trail bike',
            action: 'navigating a winding dirt path',
            environment: 'on a lush forest trail surrounded by tall green trees and morning mist',
            style: 'dreamy, fantasy look, slightly ethereal, photorealistic',
            lighting: 'soft sunlight filtering through the canopy, creating visible light rays (god rays) in the mist',
            camera: 'action shot from a low angle, capturing motion, wide-angle lens',
        },
    },
    {
        name: 'Power Rider Theme',
        data: {
            subject: 'A biker in full gear on a powerful superbike',
            action: 'performing a wheelie stunt on an empty road',
            environment: 'on a deserted asphalt road, with dust and tire smoke kicking up',
            style: 'strong cinematic action shot, high-octane movie poster style, hyper-detailed',
            lighting: 'dramatic contrast from harsh sunlight, creating deep shadows, lens flare',
            camera: 'dynamic low-angle action shot, motion blur on the background, fast shutter speed to freeze the action',
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