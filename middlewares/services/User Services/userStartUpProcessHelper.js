const UserLanguage = require("../../../models/userModels/userLanguageModel");
const ProfileSettings = require("../../../models/profileSettingModel");
const UserCategory = require("../../../models/userModels/userCategotyModel"); 




exports.startUpProcessCheck = async (userId) => {
  if (!userId) {
    return {
      appLanguage: false,
      feedLanguage: false,
      gender: false,
      hasInterestedCategory: false
    };
  }

  try {
    // ✅ Step 1: Get UserLanguage entry
    const lang = await UserLanguage.findOne(
      { userId, active: true },
      { appLanguageCode: 1, feedLanguageCode: 1 }
    ).lean();

    const appLanguage = !!lang?.appLanguageCode;
    const feedLanguage = !!lang?.feedLanguageCode;

    // ✅ Step 2: Get ProfileSettings entry
    const profile = await ProfileSettings.findOne(
      { userId },
      { gender: 1 }
    ).lean();

    const gender = !!profile?.gender;

    // ✅ Step 3: Check UserCategory entry
    const userCategory = await UserCategory.findOne(
      { userId, active: true },
      { interestedCategories: 1 }
    ).lean();

    let hasInterestedCategory = false;
    if (userCategory && Array.isArray(userCategory.interestedCategories)) {
      hasInterestedCategory = userCategory.interestedCategories.length > 0;
    }

    // ✅ Return detailed status
    return {
      appLanguage,
      feedLanguage,
      gender,
      hasInterestedCategory
    };
  } catch (error) {
    console.error("Error in startUpProcessCheck:", error);
    return {
      appLanguage: false,
      feedLanguage: false,
      gender: false,
      hasInterestedCategory: false
    };
  }
};
