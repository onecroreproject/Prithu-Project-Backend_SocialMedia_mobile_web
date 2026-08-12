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

/**
 * @route POST /api/payment/create-credit-payment
 * @desc Create a payment order to purchase credits via Instifi
 * @access Private
 */
router.post("/create-credit-payment", auth, paymentController.createCreditPayment);

/**
 * @route POST /api/payment/verify-credit-payment
 * @desc Verify credit purchase payment and credit the user's wallet
 * @access Private
 */
router.post("/verify-credit-payment", auth, paymentController.verifyCreditPayment);

module.exports = router;
