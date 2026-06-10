require("dotenv").config();
const { prithuDB } = require("./database");
const Category = require("./models/categorySchema");

async function check() {
    try {
        if (prithuDB.readyState !== 1) {
            await new Promise(r => prithuDB.once('open', r));
        }
        const cats = await Category.find({}).lean();
        console.log("All Categories in DB:");
        cats.forEach(c => {
            const idStr = c._id.toString();
            console.log(`- Name: "${c.name}", ID: "${idStr}", ID Length: ${idStr.length}, Hex String Match: ${/^[0-9a-fA-F]{24}$/.test(idStr)}`);
        });
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
