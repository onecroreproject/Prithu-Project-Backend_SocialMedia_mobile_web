const axios = require('axios');

async function testMLService() {
  const ML_SERVICE_URL = "http://localhost:8001";
  const userId = "66126689d0663738b5f3969e"; // Example User ID from DB
  
  console.log(`🔍 Testing ML Service for User: ${userId}`);
  
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/recommend`, {
      params: {
        user_id: userId,
        limit: 10
      }
    });
    
    console.log("✅ ML Service Response received!");
    console.log("User ID:", response.data.user_id);
    console.log("Recommendations Count:", response.data.recommended_reels.length);
    console.log("First Reco Reason:", response.data.recommended_reels[0]?.reason);
    console.log("Engine Status:", response.data.engine_status);
    
  } catch (error) {
    console.error("❌ ML Service Test Failed!");
    if (error.code === 'ECONNREFUSED') {
      console.error("   Python service is NOT running on port 8001.");
    } else {
      console.error("   Error:", error.message);
      if (error.response) {
        console.error("   Data:", error.response.data);
      }
    }
  }
}

testMLService();
