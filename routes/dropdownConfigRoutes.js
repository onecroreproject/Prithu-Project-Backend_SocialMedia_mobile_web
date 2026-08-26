const express = require('express');
const router = express.Router();
const { getConfig, updateConfig } = require('../controllers/dropdownConfigController');

router.get('/dropdown-config', getConfig);
router.put('/dropdown-config', updateConfig);

module.exports = router;
