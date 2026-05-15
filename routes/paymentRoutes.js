const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { auth } = require("../middlewares/jwtAuthentication");

/**
 * @route POST /api/payment/create-payment
 * @desc Create a payment transaction and get redirection URL
 * @access Private
 */
router.post("/create-payment", auth, paymentController.createPayment);

/**
 * @route POST /api/payment/verify-payment
 * @desc Verify payment status with Instifi
 * @access Private
 */
router.post("/verify-payment", auth, paymentController.verifyPayment);

module.exports = router;
