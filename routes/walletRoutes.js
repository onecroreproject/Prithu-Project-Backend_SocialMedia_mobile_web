const express = require("express");
const router = express.Router();
const walletController = require("../controllers/walletController");
const { auth } = require("../middlewares/jwtAuthentication");
const { upload } = require("../middlewares/uploadMiddleware");

router.get("/balance", auth, walletController.getWallet);
router.get("/transactions", auth, walletController.getTransactions);
router.get("/packages", auth, walletController.getCreditPackages);
router.post("/buy", auth, walletController.buyCredits);

router.post("/unlock", auth, walletController.unlockPrompt);
router.get("/unlocks", auth, walletController.getUnlockedPrompts);

router.post("/generate", auth, upload.array("images", 5), walletController.generateImage);
router.get("/generations", auth, walletController.getGenerationHistory);

module.exports = router;
