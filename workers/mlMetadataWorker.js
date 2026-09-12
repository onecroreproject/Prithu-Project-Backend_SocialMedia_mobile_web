const Feed = require("../models/feedModel");
const mlMetadataQueue = require("../queue/mlMetadataQueue");
const axios = require("axios");

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8001";

mlMetadataQueue.process(5, async (job) => {
    const { feedId } = job.data;
    console.log(`[ML-WORKER] Processing feed: ${feedId}`);

    const feed = await Feed.findById(feedId);
    if (!feed) {
        console.warn(`[ML-WORKER] Feed not found: ${feedId}`);
        return;
    }

    // SKIP POLICY: Only skip if already analyzed with the latest Deep AI version (v2)
    // If it has old v1 metadata, we want to upgrade it to v2.
    if (feed.mlMetadata?.analyzed && (feed.mlMetadata?.aiVersion || 0) >= 2) {
        console.log(`[ML-WORKER] Feed ${feedId} already has Deep AI v2 metadata, skipping.`);
        return;
    }

    try {
        // Mark as processing
        await Feed.findByIdAndUpdate(feedId, {
            "mlMetadata.processingStatus": "processing"
        });

        // Dynamic timeout based on content type (Video needs more time)
        const isVideo = feed.postType === "video";
        const timeout = isVideo ? 120000 : 30000; // 2 minutes for video, 30s for images

        // Call Python ML service for analysis
        const startTime = Date.now();
        console.log(`[Python ML 2/3: Analyze] 🎬 Sending feed ${feedId} to Python ML (${ML_SERVICE_URL}/analyze)...`);
        const response = await axios.post(`${ML_SERVICE_URL}/analyze`, {
            feed_id: feedId,
            caption: feed.caption,
            hashtags: feed.hashtags,
            category: feed.category,
            postType: feed.postType,
            mediaUrl: feed.mediaUrl
        }, { timeout });

        const metadata = response.data.metadata || response.data.analysis || {};
        const duration = Date.now() - startTime;
        console.log(`[Python ML 2/3: Analyze] ✅ Feed ${feedId} analyzed in ${duration}ms by Python ML!`);
        console.log(`   ↳ SubCategory: ${metadata.subCategory || 'N/A'}, Emotion: ${metadata.emotion || 'N/A'}, Tags: ${(metadata.recommendationTags || []).slice(0, 5).join(', ')}`);

        // Update Feed with generated metadata v2
        await Feed.findByIdAndUpdate(feedId, {
            mlMetadata: {
                analyzed: true,
                analyzedAt: new Date(),
                aiVersion: 2,
                
                contentType: metadata.contentType || (isVideo ? "video" : "image"),
                subCategory: metadata.subCategory,
                emotion: metadata.emotion,
                
                topics: metadata.topics || [],
                detectedObjects: metadata.detectedObjects || [],
                speechKeywords: metadata.speechKeywords || [],
                extractedText: metadata.extractedText || [],
                
                recommendationTags: metadata.recommendationTags || [],
                autoKeywords: metadata.autoKeywords || [],
                generatedHashtags: metadata.generatedHashtags || [],
                
                freshnessScore: metadata.freshnessScore || 1,
                confidenceScore: metadata.confidenceScore || 0,
                
                embeddingGenerated: metadata.embeddingGenerated || false,
                processingStatus: "completed"
            }
        });

        console.log(`[Python ML 2/3: Analyze] 💾 Saved ML metadata to MongoDB for feed: ${feedId}`);

    } catch (error) {
        console.error(`[Python ML 2/3: Analyze] ❌ Error analyzing feed ${feedId} with Python ML (${ML_SERVICE_URL}/analyze):`, error.message);
        
        await Feed.findByIdAndUpdate(feedId, {
            "mlMetadata.processingStatus": "failed",
            "mlMetadata.errorMessage": error.message
        });
        
        throw error; // Rethrow to let Bull handle retries if configured
    }
});

mlMetadataQueue.on("failed", (job, err) => {
    console.error(`[ML-WORKER] Job ${job.id} failed:`, err.message);
});

module.exports = mlMetadataQueue;
