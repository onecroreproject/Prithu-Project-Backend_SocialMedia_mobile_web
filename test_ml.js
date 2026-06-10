require('dotenv').config();
const mlRecommendationService = require('./services/mlRecommendationService');

async function testML() {
    const userId = '690054c6fb26e417408f72a7';
    console.log('Testing ML Service for User:', userId);
    const recos = await mlRecommendationService.getRecommendations(userId, [], null, 5);
    console.log('Recommendations:', JSON.stringify(recos, null, 2));
    process.exit(0);
}

testML();
