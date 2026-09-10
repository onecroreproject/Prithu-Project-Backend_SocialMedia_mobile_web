/**
 * SEO Scorer Utility
 * Calculates an SEO score based on best practices.
 */

const calculateSeoScore = (data) => {
    let score = 0;
    const details = [];

    const {
        title,
        description,
        focusKeyword,
        content,
        hasAltTags = true,
        hasInternalLinks = false,
        slug = ""
    } = data;

    // 1. Title length (50–60 chars) - 20 points
    if (title) {
        if (title.length >= 50 && title.length <= 60) {
            score += 20;
            details.push({ point: "Title length is optimal (50-60 chars)", score: 20 });
        } else if (title.length > 0) {
            score += 10;
            details.push({ point: "Title present but length not optimal", score: 10 });
        }
    } else {
        details.push({ point: "Title is missing", score: 0 });
    }

    // 2. Description length (140–160 chars) - 20 points
    if (description) {
        if (description.length >= 140 && description.length <= 160) {
            score += 20;
            details.push({ point: "Description length is optimal (140-160 chars)", score: 20 });
        } else if (description.length > 0) {
            score += 10;
            details.push({ point: "Description present but length not optimal", score: 10 });
        }
    } else {
        details.push({ point: "Description is missing", score: 0 });
    }

    // 3. Focus Keyword Usage - 20 points
    if (focusKeyword) {
        const keyword = focusKeyword.toLowerCase();
        let keywordScore = 0;

        if (title && title.toLowerCase().includes(keyword)) keywordScore += 5;
        if (description && description.toLowerCase().includes(keyword)) keywordScore += 5;
        if (content && content.toLowerCase().includes(keyword)) keywordScore += 10;

        score += keywordScore;
        details.push({ point: "Focus keyword usage", score: keywordScore });
    } else {
        details.push({ point: "Focus keyword not defined", score: 0 });
    }

    // 4. Image Alt Presence - 15 points
    if (hasAltTags) {
        score += 15;
        details.push({ point: "Images have alt tags", score: 15 });
    } else {
        details.push({ point: "Images missing alt tags", score: 0 });
    }

    // 5. Slug Optimization - 15 points
    if (slug) {
        const slugClean = slug.toLowerCase().trim();
        if (slugClean.length > 3 && !slugClean.includes(" ") && slugClean.includes("-")) {
            score += 15;
            details.push({ point: "Slug is SEO-friendly", score: 15 });
        } else {
            score += 5;
            details.push({ point: "Slug exists but could be optimized", score: 5 });
        }
    } else {
        details.push({ point: "Slug is missing", score: 0 });
    }

    // 6. Internal Linking - 10 points
    if (hasInternalLinks) {
        score += 10;
        details.push({ point: "Internal links present", score: 10 });
    } else {
        details.push({ point: "Internal links missing", score: 0 });
    }

    return {
        score: Math.min(score, 100),
        details,
        status: score >= 80 ? "Good" : score >= 50 ? "Needs Improvement" : "Poor",
        color: score >= 80 ? "green" : score >= 50 ? "yellow" : "red"
    };
};

/**
 * Calculate keyword density in content
 */
const calculateKeywordDensity = (content, keyword) => {
    if (!content || !keyword) return 0;

    const words = content.toLowerCase().match(/\w+/g);
    if (!words) return 0;

    const count = words.filter(word => word === keyword.toLowerCase()).length;
    return ((count / words.length) * 100).toFixed(2);
};

module.exports = {
    calculateSeoScore,
    calculateKeywordDensity
};
