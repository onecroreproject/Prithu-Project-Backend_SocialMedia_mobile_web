require("dotenv").config();
const axios = require("axios");
const https = require("https");

async function testHF() {
    const prompt = "A beautiful landscape";
    const hfToken = process.env.HF_TOKEN;

    if (!hfToken) {
        console.error("No HF_TOKEN");
        return;
    }

    const MODEL_URL = 'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0';

    try {
        const response = await axios.post(
            MODEL_URL,
            { 
                inputs: prompt,
                options: { wait_for_model: true }
            },
            {
                headers: {
                    'Authorization': `Bearer ${hfToken}`,
                    'Content-Type': 'application/json',
                },
                responseType: 'arraybuffer',
                httpsAgent: new https.Agent({ family: 4 })
            }
        );
        console.log("SUCCESS. Buffer length:", response.data.length);
    } catch (error) {
        let errMsg = error.message;
        const errorData = error.response?.data;
        if (errorData) {
            try {
                const decodedString = Buffer.from(errorData).toString('utf8');
                const parsed = JSON.parse(decodedString);
                errMsg = parsed.error || decodedString;
            } catch(e) {
                errMsg = Buffer.from(errorData).toString('utf8');
            }
        }
        console.error("ERROR from HF:");
        console.error(errMsg);
    }
}

testHF();
