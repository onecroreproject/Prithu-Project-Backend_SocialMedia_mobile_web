const express = require('express');
const router = express.Router();
const multer = require('multer');
const { generateImage } = require('../controllers/aiImageController');

// Multer setup to handle image upload in memory
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Define route for image generation
// It expects a multipart/form-data request with 'image' (file) and 'prompt' (text)
router.post('/generate', upload.single('image'), generateImage);

module.exports = router;
