require("dotenv").config();
const mongoose = require("mongoose");
const { prithuDB } = require("./database");
const Feed = require("./models/feedModel");

async function updateFeeds() {
  try {
    if (prithuDB.readyState !== 1) {
      await new Promise(resolve => prithuDB.once("connected", resolve));
    }
    console.log("Connected to DB.");

    const feeds = await Feed.find({});
    let updatedCount = 0;

    for (const feed of feeds) {
      if (!feed.designMetadata) {
        feed.designMetadata = { isTemplate: false, overlayElements: [] };
      }
      
      if (!feed.designMetadata.overlayElements) {
        feed.designMetadata.overlayElements = [];
      }

      const hasCalendar = feed.designMetadata.overlayElements.some(el => el.type === 'calendar');

      if (!hasCalendar) {
        feed.designMetadata.overlayElements.push({
          id: 'calendar',
          type: 'calendar',
          visible: true,
          xPercent: 70,
          yPercent: 20,
          wPercent: 20,
          hPercent: 15,
          zIndex: 10,
          calendarConfig: {
            headerColor: "#E54B35",
            bodyColor: "#F9F9F9"
          },
          animation: {
            enabled: true,
            direction: "right",
            speed: 1
          }
        });
        
        await feed.save({ validateBeforeSave: false }); // Avoid strict validation issues for older feeds
        updatedCount++;
        console.log(`Updated feed: ${feed._id}`);
      }
    }

    console.log(`Successfully updated ${updatedCount} feeds with a default calendar.`);
    process.exit(0);
  } catch (error) {
    console.error("Error updating feeds:", error);
    process.exit(1);
  }
}

updateFeeds();
