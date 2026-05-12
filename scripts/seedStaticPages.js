require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const { prithuDB } = require("../database");
const StaticPage = require("../models/StaticPage");

const staticPageData = [
    {
        slug: "about-us",
        title: "About Us",
        content: `
            <h2>Empowering Creativity Through Digital Expression</h2>
            <p>Welcome to Prithu, your ultimate destination for high-quality status videos, motivational reels, and creative digital content. Our mission is to provide every user with the tools they need to express themselves, inspire others, and share meaningful moments with their community.</p>
            
            <h3>Our Journey</h3>
            <p>Founded with the vision of bridging the gap between professional content creation and daily social sharing, Prithu has grown into a vibrant ecosystem for creators. We understand that in today's fast-paced digital world, a status update is more than just a video—it's a reflection of your personality, your mood, and your values.</p>
            
            <h3>What We Offer</h3>
            <p>Prithu offers a curated selection of video templates across various niches, including:</p>
            <ul>
                <li><strong>Motivational & Success:</strong> Fuel your ambition and inspire your network.</li>
                <li><strong>Spiritual & Devotional:</strong> Find peace and share your faith with beautiful visuals.</li>
                <li><strong>Entertainment & Dialogue:</strong> Express your fun side with trending movie clips and dialogues.</li>
                <li><strong>Personalized Templates:</strong> Add your name and photo to professionally designed layouts instantly.</li>
            </ul>
            
            <h3>Why Choose Prithu?</h3>
            <p>We believe in quality over quantity. Every piece of content on our platform is vetted for high resolution, emotional impact, and cultural relevance. Our smart personalization technology allows you to create "Managed" content that looks like it was made by a professional editor in just seconds.</p>
            
            <h3>Our Commitment to You</h3>
            <p>As we continue to grow, our commitment remains the same: to provide a safe, creative, and rewarding platform for users worldwide. We are constantly updating our library with daily fresh content to ensure you always have something new to share.</p>
            
            <p>Thank you for being a part of the Prithu family. Let's create something beautiful together!</p>
        `
    },
    {
        slug: "privacy-policy",
        title: "Privacy Policy",
        content: `
            <h2>Privacy Policy for Prithu</h2>
            <p>At Prithu, accessible from https://prithu.app, one of our main priorities is the privacy of our visitors. This Privacy Policy document contains types of information that is collected and recorded by Prithu and how we use it.</p>
            
            <h3>General Data Protection Regulation (GDPR)</h3>
            <p>We are a Data Controller of your information. Prithu legal basis for collecting and using the personal information described in this Privacy Policy depends on the Personal Information we collect and the specific context in which we collect the information:</p>
            <ul>
                <li>Prithu needs to perform a contract with you</li>
                <li>You have given Prithu permission to do so</li>
                <li>Processing your personal information is in Prithu legitimate interests</li>
                <li>Prithu needs to comply with the law</li>
            </ul>
            
            <h3>Log Files</h3>
            <p>Prithu follows a standard procedure of using log files. These files log visitors when they visit websites. All hosting companies do this and a part of hosting services' analytics. The information collected by log files include internet protocol (IP) addresses, browser type, Internet Service Provider (ISP), date and time stamp, referring/exit pages, and possibly the number of clicks.</p>
            
            <h3>Cookies and Web Beacons</h3>
            <p>Like any other website, Prithu uses "cookies". These cookies are used to store information including visitors' preferences, and the pages on the website that the visitor accessed or visited. The information is used to optimize the users' experience by customizing our web page content based on visitors' browser type and/or other information.</p>
            
            <h3>Google DoubleClick DART Cookie</h3>
            <p>Google is one of a third-party vendor on our site. It also uses cookies, known as DART cookies, to serve ads to our site visitors based upon their visit to www.website.com and other sites on the internet.</p>
            
            <h3>Our Advertising Partners</h3>
            <p>Some of advertisers on our site may use cookies and web beacons. Our advertising partners include:</p>
            <ul>
                <li>Google (AdSense)</li>
            </ul>
            
            <h3>Contact Information</h3>
            <p>If you have additional questions or require more information about our Privacy Policy, do not hesitate to contact us at support@prithu.app.</p>
        `
    },
    {
        slug: "terms-conditions",
        title: "Terms and Conditions",
        content: `
            <h2>Terms and Conditions</h2>
            <p>Welcome to Prithu! These terms and conditions outline the rules and regulations for the use of Prithu's Website and Mobile App, located at https://prithu.app.</p>
            
            <h3>User Accounts</h3>
            <p>By accessing this website, we assume you accept these terms and conditions. Do not continue to use Prithu if you do not agree to take all of the terms and conditions stated on this page.</p>
            
            <h3>License</h3>
            <p>Unless otherwise stated, Prithu and/or its licensors own the intellectual property rights for all material on Prithu. All intellectual property rights are reserved. You may access this from Prithu for your own personal use subjected to restrictions set in these terms and conditions.</p>
            
            <h3>User Generated Content</h3>
            <p>Parts of this website offer an opportunity for users to post and exchange opinions and information. Prithu does not filter, edit, publish or review Comments prior to their presence on the website. Comments do not reflect the views and opinions of Prithu, its agents and/or affiliates.</p>
            
            <h3>Liability</h3>
            <p>We shall not be hold responsible for any content that appears on your Website or App Profile. You agree to protect and defend us against all claims that is rising on your Profile. No link(s) should appear on any Website that may be interpreted as libellous, obscene or criminal, or which infringes, otherwise violates, or advocates the infringement or other violation of, any third party rights.</p>
            
            <h3>Disclaimer</h3>
            <p>To the maximum extent permitted by applicable law, we exclude all representations, warranties and conditions relating to our website and the use of this website.</p>
        `
    },
    {
        slug: "refund-policy",
        title: "Refund Policy",
        content: `
            <h2>Refund Policy</h2>
            <p>Thank you for subscribing to Prithu. We value your business and aim to provide the best possible experience with our premium features.</p>
            
            <h3>Subscription Cancellation</h3>
            <p>You may cancel your subscription at any time through your account settings. Upon cancellation, you will continue to have access to premium features until the end of your current billing period.</p>
            
            <h3>Refund Eligibility</h3>
            <p>Due to the digital nature of our content and the immediate access provided to premium templates and features, we generally do not offer refunds once a subscription period has begun. However, exceptions may be made in the following cases:</p>
            <ul>
                <li>Technical issues that prevent access to the service for more than 48 hours.</li>
                <li>Accidental duplicate billing.</li>
                <li>Unauthorized transactions (subject to verification).</li>
            </ul>
            
            <h3>How to Request a Refund</h3>
            <p>To request a refund, please contact our support team at support@prithu.app with your transaction details and the reason for your request. All requests must be submitted within 7 days of the transaction date.</p>
            
            <h3>Processing</h3>
            <p>Once your refund request is received and inspected, we will notify you of the approval or rejection of your refund. If approved, your refund will be processed, and a credit will automatically be applied to your original method of payment within 5-10 business days.</p>
        `
    }
];

async function seedStaticPages() {
    try {
        if (prithuDB.readyState !== 1) {
            await new Promise((resolve, reject) => {
                prithuDB.once("connected", resolve);
                prithuDB.once("error", reject);
            });
        }

        console.log("🌱 Seeding static pages...");

        for (const page of staticPageData) {
            await StaticPage.findOneAndUpdate(
                { slug: page.slug },
                { ...page, updatedAt: new Date() },
                { upsert: true, new: true }
            );
            console.log(`  + Seeded: ${page.title}`);
        }

        console.log(`\n✅ Successfully seeded ${staticPageData.length} static pages.`);
        process.exit(0);
    } catch (error) {
        console.error("❌ Seeding failed:", error);
        process.exit(1);
    }
}

seedStaticPages();
