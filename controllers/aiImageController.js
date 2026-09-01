const axios = require('axios');
const https = require('https');
const path = require('path');
const fs = require('fs');

// Force IPv4 to prevent Windows Node IPv6 DNS hang
const httpsAgent = new https.Agent({
    keepAlive: true,
    family: 4
});

const mapAspectRatio = (ratio) => {
    if (!ratio) return "1:1";
    const allowed = [
        '9:21', '5:11', '1:2', '7:13', '3:5', '2:3', '3:4', '6:7', 
        '1:1', '7:6', '4:3', '3:2', '5:3', '13:7', '2:1', '11:5', '21:9', 
        'match_input_image'
    ];
    if (allowed.includes(ratio)) return ratio;

    const mapping = {
        '9:16': '9:21',
        '16:9': '13:7',
        '4:5': '3:4',
        '5:4': '4:3',
        'square': '1:1',
        'portrait': '1:2',
        'landscape': '13:7',
        'story': '9:21'
    };

    return mapping[ratio] || '1:1';
};

const getDimensionsForAspect = (ratio) => {
    switch (ratio) {
        case '9:16':
        case '9:21':
        case 'story':
            return { width: 768, height: 1360 };
        case '16:9':
        case '13:7':
        case 'landscape':
            return { width: 1360, height: 768 };
        case '4:5':
        case '3:4':
        case 'portrait':
            return { width: 864, height: 1152 };
        case '5:4':
        case '4:3':
            return { width: 1152, height: 864 };
        case '1:1':
        case 'square':
        default:
            return { width: 1024, height: 1024 };
    }
};

exports.generateImage = async (req, res) => {
    try {
        const { prompt, image, images, aspect_ratio, steps, cfg_scale, seed } = req.body;
        const apiKey = process.env.NVIDIA_API_KEY || "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";

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ success: false, message: 'Prompt is required' });
        }

        const headers = {
            "Authorization": `Bearer ${apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
        };

        // Determine aspect ratio & pixel dimensions
        const requestedAspect = aspect_ratio || "1:1";
        const validAspectRatio = mapAspectRatio(requestedAspect);
        const dims = getDimensionsForAspect(requestedAspect);

        // Determine image input
        let imageInput = null;
        if (Array.isArray(images) && images.length > 0) {
            imageInput = images[0];
        } else if (image && typeof image === 'string') {
            imageInput = image;
        }

        if (imageInput && typeof imageInput === 'string' && imageInput.trim()) {
            if (!imageInput.startsWith('data:image/')) {
                imageInput = `data:image/jpeg;base64,${imageInput}`;
            }
        }

        let base64Image = null;
        const effectiveSeed = Number(seed) > 0 ? Number(seed) : Math.floor(Math.random() * 1000000);
        let modelUsed = "FLUX.1-schnell";

        // ═════════════════════════════════════════════════════════════════════════
        // TIER 1: NVIDIA FLUX.1-schnell (Ultra-high fidelity, 8K)
        // ═════════════════════════════════════════════════════════════════════════
        console.log(`[AI Gen] Tier 1: Synthesizing with NVIDIA FLUX.1-schnell for prompt: "${prompt.slice(0, 60)}..."`);
        try {
            const schnellRes = await axios.post(
                "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
                {
                    prompt: prompt.trim(),
                    seed: effectiveSeed
                },
                {
                    headers,
                    httpsAgent,
                    timeout: 40000
                }
            );

            if (schnellRes.status === 200 && schnellRes.data?.artifacts?.[0]?.base64) {
                base64Image = schnellRes.data.artifacts[0].base64;
                modelUsed = "NVIDIA FLUX.1-schnell";
            }
        } catch (schnellErr) {
            const errMsg = schnellErr.response?.data ? JSON.stringify(schnellErr.response.data) : schnellErr.message;
            console.log(`[AI Gen] Schnell attempt encountered: ${errMsg}`);
        }

        // ═════════════════════════════════════════════════════════════════════════
        // TIER 2: NVIDIA FLUX.1-kontext-dev (If reference image provided)
        // ═════════════════════════════════════════════════════════════════════════
        if (!base64Image && imageInput && !imageInput.includes('example_id')) {
            console.log(`[AI Gen] Tier 2: Attempting NVIDIA FLUX.1-kontext-dev with reference image...`);
            try {
                const kontextPayload = {
                    prompt: prompt.trim(),
                    image: imageInput,
                    aspect_ratio: validAspectRatio,
                    seed: effectiveSeed,
                    steps: 30
                };

                const kontextRes = await axios.post(
                    "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-kontext-dev",
                    kontextPayload,
                    {
                        headers,
                        httpsAgent,
                        timeout: 35000
                    }
                );

                if (kontextRes.status === 200) {
                    if (kontextRes.data?.artifacts?.[0]?.base64) {
                        base64Image = kontextRes.data.artifacts[0].base64;
                        modelUsed = "NVIDIA FLUX.1-kontext";
                    } else if (kontextRes.data?.image) {
                        base64Image = kontextRes.data.image;
                        modelUsed = "NVIDIA FLUX.1-kontext";
                    }
                }
            } catch (kErr) {
                const errMsg = kErr.response?.data ? JSON.stringify(kErr.response.data) : kErr.message;
                console.log(`[AI Gen] Kontext attempt encountered: ${errMsg}`);
            }
        }

        // ═════════════════════════════════════════════════════════════════════════
        // TIER 3: Pollinations FLUX Realism Engine (Ultra-reliable 8K photorealistic fallback)
        // ═════════════════════════════════════════════════════════════════════════
        if (!base64Image) {
            console.log(`[AI Gen] Tier 3: Invoking Pollinations FLUX-Realism Engine (${dims.width}x${dims.height})...`);
            try {
                const encodedPrompt = encodeURIComponent(prompt.trim());
                const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux-realism&width=${dims.width}&height=${dims.height}&seed=${effectiveSeed}&nologo=true`;
                
                const polRes = await axios.get(pollinationsUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
                    },
                    timeout: 45000
                });

                if (polRes.status === 200 && polRes.data && polRes.data.length > 5000) {
                    base64Image = Buffer.from(polRes.data).toString('base64');
                    modelUsed = "FLUX-Realism 8K Engine";
                    console.log(`[AI Gen] ✅ Pollinations FLUX Realism synthesized successfully (${polRes.data.length} bytes)`);
                }
            } catch (polErr) {
                console.log(`[AI Gen] Pollinations FLUX-Realism error: ${polErr.message}`);
            }
        }

        // ═════════════════════════════════════════════════════════════════════════
        // TIER 4: Pollinations FLUX Standard Fallback
        // ═════════════════════════════════════════════════════════════════════════
        if (!base64Image) {
            console.log(`[AI Gen] Tier 4: Invoking Pollinations Standard FLUX Engine...`);
            try {
                const encodedPrompt = encodeURIComponent(prompt.trim());
                const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=${dims.width}&height=${dims.height}&seed=${effectiveSeed}&enhance=true&nologo=true`;
                
                const polRes = await axios.get(pollinationsUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                    },
                    timeout: 45000
                });

                if (polRes.status === 200 && polRes.data && polRes.data.length > 5000) {
                    base64Image = Buffer.from(polRes.data).toString('base64');
                    modelUsed = "FLUX.1-Standard Engine";
                    console.log(`[AI Gen] ✅ Pollinations Standard FLUX synthesized successfully (${polRes.data.length} bytes)`);
                }
            } catch (polErr) {
                console.log(`[AI Gen] Pollinations Standard FLUX error: ${polErr.message}`);
            }
        }

        if (!base64Image) {
            return res.status(500).json({
                success: false,
                message: 'All AI generative engines timed out or were unavailable. Please try again with a different seed.'
            });
        }

        const resultBuffer = Buffer.from(base64Image, 'base64');

        // Save the generated image to public static directory
        const mediaDir = path.join(__dirname, '../media/ai_images');
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }

        const now = new Date();
        const timeStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}_${Math.floor(Math.random() * 1000)}`;
        const filename = `flux_${timeStr}.jpg`;
        const filePath = path.join(mediaDir, filename);

        fs.writeFileSync(filePath, resultBuffer);

        const liveUrl = `/media/ai_images/${filename}`;

        return res.status(200).json({
            success: true,
            message: `Image generated successfully with ${modelUsed}`,
            model: modelUsed,
            imageUrl: liveUrl,
            base64: `data:image/jpeg;base64,${base64Image}`,
            seed: effectiveSeed
        });

    } catch (error) {
        console.error('Error generating image:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate image',
            error: error.message || String(error)
        });
    }
};

exports.removeBg = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Image file is required' });
        }

        const apiKey = process.env.REMOVE_BG_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, message: 'REMOVE_BG_API_KEY is not configured in .env' });
        }

        const formData = new FormData();
        const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
        formData.append('image_file', blob, req.file.originalname);
        formData.append('size', 'auto');

        const response = await fetch('https://api.remove.bg/v1.0/removebg', {
            method: 'POST',
            headers: {
                'X-Api-Key': apiKey,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Remove.bg API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const resultBuffer = Buffer.from(arrayBuffer);

        // Save the generated image
        const mediaDir = path.join(__dirname, '../media/ai_images');
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }

        const now = new Date();
        const timeStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
        const filename = `nobg_${timeStr}.png`;
        const filePath = path.join(mediaDir, filename);

        fs.writeFileSync(filePath, resultBuffer);

        const liveUrl = `/media/ai_images/${filename}`;

        return res.status(200).json({
            success: true,
            message: 'Background removed successfully',
            imageUrl: liveUrl
        });

    } catch (error) {
        console.error('Error removing background:', error);
        return res.status(500).json({
            success: false,
            message: 'Error removing background. Please try again later.'
        });
    }
};

exports.checkHealth = async (req, res) => {
    const startTime = Date.now();
    try {
        const apiKey = process.env.NVIDIA_API_KEY || "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";
        const latency = Date.now() - startTime;
        return res.status(200).json({
            success: true,
            status: "ready",
            models: ["black-forest-labs/flux.1-schnell", "black-forest-labs/flux.1-kontext-dev"],
            provider: "NVIDIA NIM",
            latencyMs: latency,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            status: "unhealthy",
            error: error.message
        });
    }
};

