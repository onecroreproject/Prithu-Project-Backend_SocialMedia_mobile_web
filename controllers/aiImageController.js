const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

exports.generateImage = async (req, res) => {
    try {
        const { prompt, base64Image, mimeType } = req.body;
        const geminiApiKey = process.env.GEMINI_API_KEY;

        if (!geminiApiKey) {
            return res.status(500).json({ success: false, message: 'GEMINI_API_KEY is not configured in .env' });
        }

        if (!prompt) {
            return res.status(400).json({ success: false, message: 'Prompt is required' });
        }

        let resultBuffer;

        console.log("Using API key:", geminiApiKey?.slice(0, 10) + "...");
        console.log(`Generating image with prompt: "${prompt}" using GoogleGenAI`);

        const ai = new GoogleGenAI({ apiKey: geminiApiKey });

        const inputPrompt = [
            { type: "text", text: prompt }
        ];

        // Optional: Support for passing a base64 image alongside text based on the snippet provided
        if (base64Image) {
            inputPrompt.push({
                type: "image",
                mime_type: mimeType || "image/png",
                data: base64Image
            });
        }

        const executeGeneration = async () => {
            return await ai.interactions.create({
                model: "gemini-2.5-flash-image",
                input: inputPrompt,
            });
        };

        let interaction;
        let retries = 3;
        for (let i = 0; i < retries; i++) {
            try {
                interaction = await executeGeneration();
                break;
            } catch (err) {
                if (err.status !== 429 || i === retries - 1) {
                    throw err;
                }
                console.log(`Retry ${i + 1} after rate limit`);
                await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
            }
        }

        const generatedImage = interaction?.output_image;

        if (generatedImage && generatedImage.data) {
            resultBuffer = Buffer.from(generatedImage.data, "base64");
        }

        if (!resultBuffer) {
            throw new Error("No output_image found in the Gemini response.");
        }

        // Save the generated image
        const mediaDir = path.join(__dirname, '../media/ai_images');
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }

        const now = new Date();
        const timeStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
        const filename = `generated_${timeStr}.png`;
        const filePath = path.join(mediaDir, filename);

        fs.writeFileSync(filePath, resultBuffer);

        const liveUrl = `/media/ai_images/${filename}`;

        return res.status(200).json({
            success: true,
            message: 'Image generated successfully',
            imageUrl: liveUrl
        });

    } catch (error) {
        console.error('Error generating image:', error);

        if (error.status === 429) {
            return res.status(429).json({
                success: false,
                message: "Image generation quota exceeded. Please try again later or upgrade your Gemini plan.",
            });
        }

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
