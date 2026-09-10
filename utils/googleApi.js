const { google } = require('googleapis');

/**
 * Google SEO API Utility
 * Handles Search Console and Analytics Data APIs
 */
class GoogleSeoApi {
    constructor(credentials) {
        if (!credentials) {
            this.auth = null;
            return;
        }

        try {
            this.auth = new google.auth.GoogleAuth({
                credentials,
                scopes: [
                    'https://www.googleapis.com/auth/webmasters.readonly',
                    'https://www.googleapis.com/auth/analytics.readonly'
                ],
            });
        } catch (error) {
            console.error('Google Auth Initialization Error:', error);
            this.auth = null;
        }
    }

    /**
     * Get Search Console data
     */
    async getSearchConsoleData(siteUrl, startDate, endDate) {
        if (!this.auth) return null;

        try {
            const searchconsole = google.searchconsole({ version: 'v1', auth: this.auth });
            const response = await searchconsole.searchanalytics.query({
                siteUrl,
                requestBody: {
                    startDate,
                    endDate,
                    dimensions: ['query', 'page'],
                    rowLimit: 10
                }
            });
            return response.data;
        } catch (error) {
            console.error('Search Console API Error:', error);
            return null;
        }
    }

    /**
     * Get Analytics Data (GA4)
     */
    async getAnalyticsData(propertyId, startDate, endDate) {
        if (!this.auth) return null;

        try {
            const analyticsdata = google.analyticsdata({ version: 'v1beta', auth: this.auth });
            const response = await analyticsdata.properties.runReport({
                property: `properties/${propertyId}`,
                requestBody: {
                    dateRanges: [{ startDate, endDate }],
                    metrics: [
                        { name: 'activeUsers' },
                        { name: 'sessions' },
                        { name: 'screenPageViews' },
                        { name: 'bounceRate' }
                    ],
                    dimensions: [{ name: 'pagePath' }]
                }
            });
            return response.data;
        } catch (error) {
            console.error('Analytics Data API Error:', error);
            return null;
        }
    }
}

module.exports = GoogleSeoApi;
