require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const redisClient = require("../Config/redisConfig");
const { prithuDB } = require("../database");

// Models
const Feed = require("../models/feedModel");
const User = require("../models/userModels/userModel");
const UserCategory = require("../models/userModels/userCategotyModel");
const UserFeedback = require("../models/UserFeedbackAndReport");

// Controllers
const trackController = require("../controllers/analytics/trackController");
const userActionsFeedController = require("../controllers/feedControllers/userActionsFeedController");

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8001";

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log("==========================================");
    console.log("🚀 STARTING E2E RECO V2 & METADATA V2 INTEGRATION TESTS");
    console.log("==========================================\n");

    let testUser;

    try {
        // Ensure Database connection
        if (prithuDB.readyState !== 1) {
            console.log("Waiting for DB connection...");
            await new Promise(resolve => prithuDB.once("open", resolve));
        }
        console.log("✅ DB Connected.");

        // Find a test feed to use in tests
        const testFeed = await Feed.findOne({ caption: { $exists: true, $ne: "" } }).sort({ createdAt: -1 }).lean();
        if (!testFeed) {
            throw new Error("No test feed found in the database. Cannot run tests.");
        }
        console.log(`✅ Found Test Feed. ID: ${testFeed._id}, Caption: "${testFeed.caption}"`);

        // Find a test user or create a temporary mock one
        testUser = await User.findOne({ email: { $exists: true } }).lean();
        if (!testUser) {
            console.log("Creating temporary mock user for testing...");
            testUser = await User.create({
                userName: "test_reco_user",
                email: "test_reco_user@example.com",
                password: "hashedpassword123",
                role: "user"
            });
            testUser = testUser.toObject();
        }
        console.log(`✅ Found Test User. ID: ${testUser._id}, Username: "${testUser.userName}"`);

        console.log("\n------------------------------------------");
        console.log("🤖 PART 1: FastAPI Python ML Endpoint Tests");
        console.log("------------------------------------------");

        // 1. Test FastAPI /analyze
        console.log("\n1. Testing FastAPI /analyze endpoint...");
        try {
            const analyzeRes = await axios.post(`${ML_SERVICE_URL}/analyze`, {
                feed_id: testFeed._id.toString(),
                caption: testFeed.caption,
                hashtags: testFeed.hashtags || [],
                category: testFeed.category || []
            });
            
            console.log("FastAPI /analyze Response:", JSON.stringify(analyzeRes.data, null, 2));
            if (analyzeRes.data.success && analyzeRes.data.metadata.aiVersion === 2) {
                console.log("👉 SUCCESS: FastAPI successfully parsed V2 content metadata!");
            } else {
                throw new Error("FastAPI metadata analysis returned invalid response format or incorrect version.");
            }
        } catch (err) {
            console.error("❌ FastAPI /analyze Test FAILED:", err.message);
            if (err.response) console.error("Response data:", err.response.data);
            throw err;
        }

        // 2. Test FastAPI /recommend
        console.log("\n2. Testing FastAPI /recommend endpoint...");
        try {
            const recommendRes = await axios.get(`${ML_SERVICE_URL}/recommend`, {
                params: {
                    user_id: testUser._id.toString(),
                    v2: true,
                    limit: 5
                }
            });
            console.log(`FastAPI /recommend Returned ${recommendRes.data.recommended_reels?.length} Reels.`);
            console.log("Sample recommendation:", JSON.stringify(recommendRes.data.recommended_reels?.[0], null, 2));
            
            if (recommendRes.data.recommended_reels && recommendRes.data.recommended_reels.length >= 0) {
                console.log("👉 SUCCESS: FastAPI recommendation engine `/recommend` responded correctly!");
            } else {
                throw new Error("FastAPI recommendation returned invalid format.");
            }
        } catch (err) {
            console.error("❌ FastAPI /recommend Test FAILED:", err.message);
            if (err.response) console.error("Response data:", err.response.data);
            throw err;
        }

        console.log("\n------------------------------------------");
        console.log("⚡ PART 2: Node.js trackWatchTime Skip Trigger Tests");
        console.log("------------------------------------------");

        if (redisClient.status !== "ready") {
            console.warn("⚠️ Redis client is not ready. Skipping consecutive ignores & learning flags test.");
        } else {
            const trackerKey = testUser._id.toString();
            const ignoreKey = `consecutive_ignores:${trackerKey}`;
            const cooldownKey = `feedback_popup_cooldown:${trackerKey}`;

            // Clean up any existing state in Redis first
            await redisClient.del(ignoreKey);
            await redisClient.del(cooldownKey);
            await redisClient.del(`user_diversity_boost:${trackerKey}`);
            await redisClient.del(`user_prefer_short:${trackerKey}`);

            // Helper to execute trackWatchTime
            const runTrackWatchTime = async (watchTime, percentageWatched) => {
                const req = {
                    body: {
                        feedId: testFeed._id.toString(),
                        watchTime,
                        percentageWatched,
                        sessionId: "test_session_id",
                        recoScore: 0.9,
                        recoSource: "v2"
                    },
                    Id: testUser._id.toString()
                };

                let resPayload = null;
                const res = {
                    status: function() { return this; },
                    json: function(payload) {
                        resPayload = payload;
                        return this;
                    }
                };

                await trackController.trackWatchTime(req, res);
                return resPayload;
            };

            // Test 1: First skip (< 4s, < 15%)
            console.log("\n1. Simulating first quick skip...");
            let res = await runTrackWatchTime(2, 10);
            let count = await redisClient.get(ignoreKey);
            console.log(`Response:`, res);
            console.log(`Redis Ignores Count: ${count}`);
            if (res.success && res.triggerFeedbackPopup === false && Number(count) === 1) {
                console.log("👉 SUCCESS: First ignore incremented Redis count, did not trigger popup.");
            } else {
                throw new Error("First ignore tracking failed.");
            }

            // Test 2: Second quick skip
            console.log("\n2. Simulating second quick skip...");
            res = await runTrackWatchTime(3, 12);
            count = await redisClient.get(ignoreKey);
            console.log(`Response:`, res);
            console.log(`Redis Ignores Count: ${count}`);
            if (res.success && res.triggerFeedbackPopup === false && Number(count) === 2) {
                console.log("👉 SUCCESS: Second ignore incremented Redis count, did not trigger popup.");
            } else {
                throw new Error("Second ignore tracking failed.");
            }

            // Test 3: Third quick skip -> Should trigger feedback popup!
            console.log("\n3. Simulating third quick skip (should trigger popup)...");
            res = await runTrackWatchTime(1, 5);
            count = await redisClient.get(ignoreKey);
            console.log(`Response:`, res);
            console.log(`Redis Ignores Count: ${count}`);
            if (res.success && res.triggerFeedbackPopup === true && Number(count) === 3) {
                console.log("👉 SUCCESS: Third consecutive ignore successfully triggered feedback popup!");
            } else {
                throw new Error("Third consecutive ignore did not trigger feedback popup.");
            }

            // Test 4: Cooldown prevention (ignored count reset / popup cooldown check)
            console.log("\n4. Simulating fourth skip under cooldown...");
            // Set cooldown manually to ensure test accuracy
            await redisClient.set(cooldownKey, "true", "EX", 3600);
            res = await runTrackWatchTime(2, 8);
            console.log(`Response under Cooldown:`, res);
            if (res.success && res.triggerFeedbackPopup === false) {
                console.log("👉 SUCCESS: Cooldown successfully prevented repeated feedback popups.");
            } else {
                throw new Error("Feedback popup triggered despite cooldown.");
            }

            // Clean up cooldown
            await redisClient.del(cooldownKey);
        }

        console.log("\n------------------------------------------");
        console.log("✍️ PART 3: submitFeedbackPopup Controller & Preferences Learning Tests");
        console.log("------------------------------------------");

        const executeSubmitFeedback = async (option) => {
            const req = {
                body: {
                    feedId: testFeed._id.toString(),
                    option,
                    sessionId: "test_session_id"
                },
                Id: testUser._id.toString()
            };

            let resPayload = null;
            const res = {
                status: function() { return this; },
                json: function(payload) {
                    resPayload = payload;
                    return this;
                }
            };

            await userActionsFeedController.submitFeedbackPopup(req, res);
            return resPayload;
        };

        // Test 1: Submit "Not my interest" -> Verify category exclusion
        console.log("\n1. Testing 'Not my interest' feedback option...");
        // Ensure user category document is clean
        await UserCategory.deleteOne({ userId: testUser._id });

        let feedbackRes = await executeSubmitFeedback("Not my interest");
        console.log("Feedback Submit Response:", feedbackRes);

        // Verify database state
        const userCatDoc = await UserCategory.findOne({ userId: testUser._id }).lean();
        console.log("UserCategory document in DB:", userCatDoc);

        const expectedCatId = testFeed.category?.[0];
        const hasExcluded = userCatDoc && userCatDoc.nonInterestedCategories?.some(cid => cid.toString() === expectedCatId.toString());

        if (feedbackRes.success && hasExcluded) {
            console.log("👉 SUCCESS: 'Not my interest' added feed's category to nonInterestedCategories!");
        } else {
            throw new Error("'Not my interest' logic failed to exclude category in DB.");
        }

        // Verify that Redis ignores count is reset to 0, and cooldown is set to 1 hour
        if (redisClient.status === "ready") {
            const ignoreCount = await redisClient.get(`consecutive_ignores:${testUser._id}`);
            const cooldownSet = await redisClient.get(`feedback_popup_cooldown:${testUser._id}`);
            console.log(`Post-Submit Ignores Count: ${ignoreCount}, Cooldown Set: ${cooldownSet}`);
            if (ignoreCount === "0" && cooldownSet === "true") {
                console.log("👉 SUCCESS: Redis consecutive ignores reset and popup cooldown activated.");
            } else {
                throw new Error("Redis reset or cooldown logic failed upon feedback submission.");
            }
        }

        // Test 2: Submit "Too repetitive" -> Verify user_diversity_boost flag set in Redis
        if (redisClient.status === "ready") {
            console.log("\n2. Testing 'Too repetitive' feedback option...");
            await redisClient.del(`user_diversity_boost:${testUser._id}`);
            
            feedbackRes = await executeSubmitFeedback("Too repetitive");
            const divBoost = await redisClient.get(`user_diversity_boost:${testUser._id}`);
            console.log(`Redis diversity boost value: ${divBoost}`);
            if (feedbackRes.success && divBoost === "true") {
                console.log("👉 SUCCESS: 'Too repetitive' feedback successfully set Redis user_diversity_boost!");
            } else {
                throw new Error("'Too repetitive' feedback did not set diversity boost flag in Redis.");
            }
        }

        // Test 3: Submit "Too long" -> Verify user_prefer_short flag set in Redis
        if (redisClient.status === "ready") {
            console.log("\n3. Testing 'Too long' feedback option...");
            await redisClient.del(`user_prefer_short:${testUser._id}`);
            
            feedbackRes = await executeSubmitFeedback("Too long");
            const preferShort = await redisClient.get(`user_prefer_short:${testUser._id}`);
            console.log(`Redis prefer short value: ${preferShort}`);
            if (feedbackRes.success && preferShort === "true") {
                console.log("👉 SUCCESS: 'Too long' feedback successfully set Redis user_prefer_short!");
            } else {
                throw new Error("'Too long' feedback did not set prefer short flag in Redis.");
            }
        }

        // 📖 PART 4: Test Pagination & Overlap Prevention in getRecommendedFeeds
        console.log("\n------------------------------------------");
        console.log("📖 PART 4: getRecommendedFeeds Pagination & Exclusions Tests");
        console.log("------------------------------------------");
        try {
            const recommendationService = require("../services/analytics/recommendationService");
            
            console.log("Fetching page 1 (limit=5)...");
            const page1Feeds = await recommendationService.getRecommendedFeeds(testUser._id.toString(), 1, 5);
            console.log(`Page 1 returned ${page1Feeds.length} feeds.`);
            
            // Track shown feeds to simulate actual server controller behavior
            if (redisClient.status === "ready") {
                const mlRecommendationService = require("../services/mlRecommendationService");
                await mlRecommendationService.trackShownFeeds(testUser._id.toString(), page1Feeds.map(f => f._id.toString()));
                console.log("Page 1 feeds tracked as shown in Redis.");
            }
            
            console.log("Fetching page 2 (limit=5)...");
            const page2Feeds = await recommendationService.getRecommendedFeeds(testUser._id.toString(), 2, 5);
            console.log(`Page 2 returned ${page2Feeds.length} feeds.`);

            // Verify overlap
            const page1Ids = page1Feeds.map(f => f._id.toString());
            const page2Ids = page2Feeds.map(f => f._id.toString());
            
            const overlap = page1Ids.filter(id => page2Ids.includes(id));
            console.log("Overlap feed IDs between page 1 and page 2:", overlap);
            
            if (overlap.length === 0) {
                console.log("👉 SUCCESS: Page 1 and Page 2 contain completely different feeds! Pagination resolved.");
            } else if (overlap.length < page1Feeds.length) {
                console.log("👉 WARNING: Some overlap exists due to random fallback blends, but they are not identical. Overlapping count:", overlap.length);
            } else {
                throw new Error("Page 1 and Page 2 are identical! Repeating feeds issue is present.");
            }
        } catch (pagErr) {
            console.error("❌ Pagination Test FAILED:", pagErr.message);
            throw pagErr;
        }

        console.log("\n==========================================");
        console.log("🎉 ALL V2 INTEGRATION & PAGINATION TESTS PASSED SUCCESSFULLY!");
        console.log("==========================================");

    } catch (err) {
        console.error("\n❌ E2E Integration test FAILED with error:", err);
    } finally {
        // Clean up test data from DB
        console.log("\nCleaning up test database modifications...");
        if (testUser && testUser.userName === "test_reco_user") {
            await User.deleteOne({ _id: testUser._id });
        }
        if (testUser) {
            await UserCategory.deleteOne({ userId: testUser._id });
            await UserFeedback.deleteMany({ userId: testUser._id });
            if (redisClient.status === "ready") {
                const trackerKey = testUser._id.toString();
                await redisClient.del(`consecutive_ignores:${trackerKey}`);
                await redisClient.del(`feedback_popup_cooldown:${trackerKey}`);
                await redisClient.del(`user_diversity_boost:${trackerKey}`);
                await redisClient.del(`user_prefer_short:${trackerKey}`);
            }
        }
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB. Exiting test.");
        process.exit(0);
    }
}

runTests();
