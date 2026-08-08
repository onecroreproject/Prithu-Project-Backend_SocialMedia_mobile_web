require("dotenv").config();
const { prithuDB } = require("./database");
const Category = require("./models/categorySchema");

async function check() {
    try {
        if (prithuDB.readyState !== 1) {
            await new Promise(r => prithuDB.once('open', r));
        }
        const ids = ["6982ffc27494442901f92515", "6982ffc27494442901f9251b", "6982ffc27494442901f92513"];
        const cats = await Category.find({ _id: { $in: ids } }).lean();
        console.log("Category Names:", cats.map(c => c.name));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
