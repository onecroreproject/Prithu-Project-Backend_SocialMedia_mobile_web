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

    // Double check if already analyzed to prevent redundant processing
    if (feed.mlMetadata?.analyzed) {
        console.log(`[ML-WORKER] Feed ${feedId} already analyzed, skipping.`);
        return;
    }

    try {
        // Mark as processing
        await Feed.findByIdAndUpdate(feedId, {
            "mlMetadata.processingStatus": "processing"
        });

        // Call Python ML service for analysis
        const response = await axios.post(`${ML_SERVICE_URL}/analyze`, {
            feed_id: feedId,
            caption: feed.caption,
            hashtags: feed.hashtags,
            category: feed.category,
            postType: feed.postType,
            mediaUrl: feed.mediaUrl
        }, { timeout: 30000 });

        const { metadata } = response.data;

        // Update Feed with generated metadata
        await Feed.findByIdAndUpdate(feedId, {
            mlMetadata: {
                analyzed: true,
                analyzedAt: new Date(),
                topics: metadata.topics || [],
                detectedObjects: metadata.detectedObjects || [],
                speechKeywords: metadata.speechKeywords || [],
                recommendationTags: metadata.recommendationTags || [],
                contentType: metadata.contentType,
                subCategory: metadata.subCategory,
                freshnessScore: metadata.freshnessScore || 0,
                confidenceScore: metadata.confidenceScore || 0,
                embeddingGenerated: metadata.embeddingGenerated || false,
                processingStatus: "completed"
            }
        });

        console.log(`[ML-WORKER] Successfully analyzed feed: ${feedId}`);

    } catch (error) {
        console.error(`[ML-WORKER] Error analyzing feed ${feedId}:`, error.message);
        
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
