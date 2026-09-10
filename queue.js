const Queue = require("bull");
const redisClient=require("./Config/redisConfig")

 
const createQueue = (name) => new Queue(name, { redis: redisClient });
 
module.exports = createQueue;

 