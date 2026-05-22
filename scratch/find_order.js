require("dotenv").config();
const mongoose = require("mongoose");

async function checkTxn() {
  await mongoose.connect(process.env.PRITHU_DB_URI || "mongodb+srv://prithuapp_db_user:eETUIeouSRU7Xipu@cluster0.x0vkq8e.mongodb.net/Prithu-DB?retryWrites=true&w=majority&appName=Cluster0");
  console.log("Connected to DB");
  const PaymentTransaction = require("../models/PaymentTransaction");
  
  const txn = await PaymentTransaction.findOne({ orderId: "ORD44373242" });
  console.log("Transaction found for ORD44373242:", txn);
  
  const allTxns = await PaymentTransaction.find({}).sort({ createdAt: -1 }).limit(10);
  console.log("Recent 10 Transactions in DB:");
  for (let t of allTxns) {
    console.log(`- OrderId: ${t.orderId}, Status: ${t.paymentStatus}, CreatedAt: ${t.createdAt}, Amount: ${t.amount}`);
  }
  
  await mongoose.disconnect();
}

checkTxn();
