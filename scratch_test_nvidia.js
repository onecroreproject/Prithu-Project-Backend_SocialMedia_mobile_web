require('dotenv').config();
const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({
    keepAlive: true,
    family: 4
});

const apiKey = process.env.NVIDIA_API_KEY || "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";

async function testNvidia() {
    console.log("Testing NVIDIA API Key:", apiKey.slice(0, 15) + "...");
    
    // 1. Test FLUX schnell
    try {
        console.log("1. Testing FLUX.1-schnell...");
        const t0 = Date.now();
        const res = await axios.post(
            "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
            {
                prompt: "Futuristic cyberpunk street at midnight with glowing violet and cyan neon signage",
                seed: 12345
            },
            {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                httpsAgent,
                timeout: 60000
            }
        );
        console.log(`FLUX.1-schnell success in ${(Date.now() - t0)/1000}s! Status:`, res.status);
        if (res.data.artifacts && res.data.artifacts.length > 0) {
            console.log("Artifact base64 length:", res.data.artifacts[0].base64.length);
        }
    } catch (err) {
        console.error("FLUX.1-schnell error:", err.response?.status, err.response?.data || err.message);
    }
}

testNvidia();
