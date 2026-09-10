// helpers/calculateProfileCompletion.js

exports.calculateProfileCompletion = (profile) => {
  if (!profile || typeof profile !== "object") {
    return { completion: 0, missingFields: [], message: "No profile data found" };
  }

  // 🧩 Important fields from ProfileSettings schema
  const importantFields = [
    "displayName",
    "userName",
    "bio",
    "gender",
    "dateOfBirth",
    "maritalStatus",
    "phoneNumber",
    "country",
    "city",
    "profileAvatar",
    "coverPhoto",
    "socialLinks",
  ];

  let filledCount = 0;
  const missingFields = [];

  importantFields.forEach((field) => {
    const value = profile[field];

    // Handle nested object (socialLinks)
    if (field === "socialLinks" && typeof value === "object" && value !== null) {
      if (Object.values(value).some((v) => v && v.trim() !== "")) {
        filledCount++;
      } else {
        missingFields.push(field);
      }
    } else if (value && value.toString().trim() !== "") {
      filledCount++;
    } else {
      missingFields.push(field);
    }
  });

  const ratio = filledCount / importantFields.length;
  let completion = 0;
  let message = "";

  // 🎯 Smart milestone + fine-tuned logic
  if (missingFields.length === 0) {
    completion = 100;
    message = "Profile fully completed — great job!";
  } else if (missingFields.length === 1) {
    completion = 99;
    message = "Almost there! Just one more field to complete.";
  } else if (missingFields.length <= 3) {
    completion = 98;
    message = "So close! A few more fields to finish your profile.";
  } else if (ratio <= 0.1) {
    completion = 15;
    message = "Let's get started! Begin filling your profile.";
  } else if (ratio <= 0.25) {
    completion = 25;
    message = "Nice start! Keep adding details.";
  } else if (ratio <= 0.35) {
    completion = 35;
    message = "Good progress! Add more info to reach 50%.";
  } else if (ratio <= 0.5) {
    completion = 50;
    message = "Halfway there! Keep going.";
  } else if (ratio <= 0.65) {
    completion = 65;
    message = "You're making great progress!";
  } else if (ratio <= 0.75) {
    completion = 75;
    message = "Almost done — just a few fields left!";
  } else if (ratio <= 0.8) {
    completion = 80;
    message = "Very close! A couple more details needed.";
  } else if (ratio <= 0.9) {
    completion = 90;
    message = "Excellent! Just a few tweaks left.";
  } else {
    completion = 95;
    message = "Almost perfect! Finish the remaining details.";
  }

  return { completion, missingFields, message };
};
