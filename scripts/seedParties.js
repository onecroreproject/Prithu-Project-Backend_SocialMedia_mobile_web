require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const { prithuDB } = require("../database");
const Party = require("../models/partyModel");

const statesWithRegionalNames = [
    "Andhra Pradesh – ఆంధ్రప్రదేశ్",
    "Arunachal Pradesh – अरुणाचल प्रदेश",
    "Assam – অসম",
    "Bihar – बिहार",
    "Chhattisgarh – छत्तीसगढ़",
    "Goa – गोवा",
    "Gujarat – ગુજરાત",
    "Haryana – हरियाणा",
    "Himachal Pradesh – हिमाचल प्रदेश",
    "Jharkhand – झारखंड",
    "Karnataka – ಕರ್ನಾಟಕ",
    "Kerala – കേരളം",
    "Madhya Pradesh – मध्य प्रदेश",
    "Maharashtra – महाराष्ट्र",
    "Manipur – মণিপুর",
    "Meghalaya – Meghalaya",
    "Mizoram – Mizoram",
    "Nagaland – Nagaland",
    "Odisha – ଓଡ଼ିଶା",
    "Punjab – ਪੰਜਾਬ",
    "Rajasthan – राजस्थान",
    "Sikkim – सिक्किम",
    "Tamil Nadu – தமிழ்நாடு",
    "Telangana – తెలంగాణ",
    "Tripura – त्रिपुरा",
    "Uttar Pradesh – उत्तर प्रदेश",
    "Uttarakhand – उत्तराखंड",
    "West Bengal – পশ্চিমবঙ্গ"
];

const partyData = [
    { "state": "Andhra Pradesh", "parties": ["YSRCP", "TDP", "BJP", "INC", "JSP"] },
    { "state": "Arunachal Pradesh", "parties": ["BJP", "INC", "NPP"] },
    { "state": "Assam", "parties": ["BJP", "INC", "AGP", "AIUDF", "UPPL"] },
    { "state": "Bihar", "parties": ["BJP", "JD(U)", "RJD", "INC", "LJP", "HAM"] },
    { "state": "Chhattisgarh", "parties": ["BJP", "INC", "JCCJ"] },
    { "state": "Goa", "parties": ["BJP", "INC", "AAP", "MGP", "RGP"] },
    { "state": "Gujarat", "parties": ["BJP", "INC", "AAP"] },
    { "state": "Haryana", "parties": ["BJP", "INC", "JJP", "INLD", "AAP"] },
    { "state": "Himachal Pradesh", "parties": ["BJP", "INC", "AAP"] },
    { "state": "Jharkhand", "parties": ["JMM", "BJP", "INC", "AJSU"] },
    { "state": "Karnataka", "parties": ["BJP", "INC", "JDS", "AAP"] },
    { "state": "Kerala", "parties": ["CPM", "INC", "BJP", "IUML"] },
    { "state": "Madhya Pradesh", "parties": ["BJP", "INC", "BSP"] },
    { "state": "Maharashtra", "parties": ["BJP", "SS", "SHS(UBT)", "NCP", "NCP(SP)", "INC"] },
    { "state": "Manipur", "parties": ["BJP", "INC", "NPP"] },
    { "state": "Meghalaya", "parties": ["NPP", "UDP", "INC", "BJP", "HSPDP"] },
    { "state": "Mizoram", "parties": ["MNF", "ZPM", "INC"] },
    { "state": "Nagaland", "parties": ["NDPP", "NPF", "BJP"] },
    { "state": "Odisha", "parties": ["BJD", "BJP", "INC"] },
    { "state": "Punjab", "parties": ["AAP", "INC", "SAD", "BJP", "BSP"] },
    { "state": "Rajasthan", "parties": ["BJP", "INC", "BSP"] },
    { "state": "Sikkim", "parties": ["SKM", "SDF", "BJP"] },
    { "state": "Tamil Nadu", "parties": ["DMK", "AIADMK", "BJP", "INC", "MNM", "DMDK", "VCK", "TVK", "PMK"] },
    { "state": "Telangana", "parties": ["INC", "BJP", "BRS", "AIMIM"] },
    { "state": "Tripura", "parties": ["BJP", "CPM", "INC", "TIPRA"] },
    { "state": "Uttar Pradesh", "parties": ["BJP", "SP", "BSP", "INC", "RLD"] },
    { "state": "Uttarakhand", "parties": ["BJP", "INC", "AAP"] },
    { "state": "West Bengal", "parties": ["TMC", "BJP", "INC", "CPM", "ISF"] }
];

const partyLogos = [
    { "party": "BJP", "logo": "https://example.com/logos/bjp.png" },
    { "party": "INC", "logo": "https://example.com/logos/inc.png" },
    { "party": "CPI(M)", "logo": "https://example.com/logos/cpim.png" },
    { "party": "CPM", "logo": "https://example.com/logos/cpim.png" },
    { "party": "AAP", "logo": "https://example.com/logos/aap.png" },
    { "party": "BSP", "logo": "https://example.com/logos/bsp.png" },
    { "party": "NPP", "logo": "https://example.com/logos/npp.png" },
    { "party": "DMK", "logo": "https://example.com/logos/dmk.png" },
    { "party": "AIADMK", "logo": "https://example.com/logos/aiadmk.png" },
    { "party": "TMC", "logo": "https://example.com/logos/tmc.png" },
    { "party": "YSRCP", "logo": "https://example.com/logos/ysrcp.png" },
    { "party": "TDP", "logo": "https://example.com/logos/tdp.png" },
    { "party": "SP", "logo": "https://example.com/logos/sp.png" },
    { "party": "BRS", "logo": "https://example.com/logos/brs.png" },
    { "party": "TVK", "logo": "https://example.com/logos/tvk.png" },
    { "party": "MNM", "logo": "https://example.com/logos/mnm.png" },
    { "party": "VCK", "logo": "https://example.com/logos/vck.png" },
    { "party": "PMK", "logo": "https://example.com/logos/pmk.png" },
    { "party": "TIPRA", "logo": "https://example.com/logos/tipra.png" },
    { "party": "UPPL", "logo": "https://example.com/logos/uppl.png" },
    { "party": "JMM", "logo": "https://example.com/logos/jmm.png" },
    { "party": "AJSU", "logo": "https://example.com/logos/ajsu.png" }
];

const partyLeaders = [
    {
        "party": "BJP",
        "leaders": [
            { "name": "Narendra Modi", "photo": "https://example.com/leaders/bjp/modi.png", "order": 1 },
            { "name": "Amit Shah", "photo": "https://example.com/leaders/bjp/amitshah.png", "order": 2 }
        ]
    },
    {
        "party": "INC",
        "leaders": [
            { "name": "Mallikarjun Kharge", "photo": "https://example.com/leaders/inc/kharge.png", "order": 1 },
            { "name": "Rahul Gandhi", "photo": "https://example.com/leaders/inc/rahul.png", "order": 2 }
        ]
    },
    {
        "party": "CPM",
        "leaders": [
            { "name": "Sitaram Yechury", "photo": "https://example.com/leaders/cpm/yechury.png", "order": 1 }
        ]
    },
    {
        "party": "AAP",
        "leaders": [
            { "name": "Arvind Kejriwal", "photo": "https://example.com/leaders/aap/kejriwal.png", "order": 1 }
        ]
    },
    {
        "party": "BSP",
        "leaders": [
            { "name": "Mayawati", "photo": "https://example.com/leaders/bsp/mayawati.png", "order": 1 }
        ]
    },
    {
        "party": "NPP",
        "leaders": [
            { "name": "Conrad Sangma", "photo": "https://example.com/leaders/npp/sangma.png", "order": 1 }
        ]
    },
    {
        "party": "DMK",
        "leaders": [
            { "name": "M. K. Stalin", "photo": "https://example.com/leaders/dmk/stalin.png", "order": 1 },
            { "name": "Udhayanidhi Stalin", "photo": "https://example.com/leaders/dmk/udhayanidhi.png", "order": 2 }
        ]
    },
    {
        "party": "AIADMK",
        "leaders": [
            { "name": "Edappadi K. Palaniswami", "photo": "https://example.com/leaders/aiadmk/eps.png", "order": 1 }
        ]
    },
    {
        "party": "TMC",
        "leaders": [
            { "name": "Mamata Banerjee", "photo": "https://example.com/leaders/tmc/mamata.png", "order": 1 }
        ]
    },
    {
        "party": "YSRCP",
        "leaders": [
            { "name": "Y. S. Jagan Mohan Reddy", "photo": "https://example.com/leaders/ysrcp/jagan.png", "order": 1 }
        ]
    },
    {
        "party": "TDP",
        "leaders": [
            { "name": "N. Chandrababu Naidu", "photo": "https://example.com/leaders/tdp/naidu.png", "order": 1 }
        ]
    },
    {
        "party": "SP",
        "leaders": [
            { "name": "Akhilesh Yadav", "photo": "https://example.com/leaders/sp/akhilesh.png", "order": 1 }
        ]
    },
    {
        "party": "BRS",
        "leaders": [
            { "name": "K. Chandrashekar Rao", "photo": "https://example.com/leaders/brs/kcr.png", "order": 1 }
        ]
    },
    {
        "party": "TVK",
        "leaders": [
            { "name": "Vijay", "photo": "https://example.com/leaders/tvk/vijay.png", "order": 1 }
        ]
    },
    {
        "party": "MNM",
        "leaders": [
            { "name": "Kamal Haasan", "photo": "https://example.com/leaders/mnm/kamal.png", "order": 1 }
        ]
    },
    {
        "party": "VCK",
        "leaders": [
            { "name": "Thol. Thirumavalavan", "photo": "https://example.com/leaders/vck/thiru.png", "order": 1 }
        ]
    },
    {
        "party": "PMK",
        "leaders": [
            { "name": "Anbumani Ramadoss", "photo": "https://example.com/leaders/pmk/anbumani.png", "order": 1 }
        ]
    },
    {
        "party": "TIPRA",
        "leaders": [
            { "name": "Pradyot Manikya Debbarma", "photo": "https://example.com/leaders/tipra/pradyot.png", "order": 1 }
        ]
    },
    {
        "party": "UPPL",
        "leaders": [
            { "name": "Pramod Boro", "photo": "https://example.com/leaders/uppl/boro.png", "order": 1 }
        ]
    },
    {
        "party": "JMM",
        "leaders": [
            { "name": "Hemant Soren", "photo": "https://example.com/leaders/jmm/hemant.png", "order": 1 }
        ]
    },
    {
        "party": "AJSU",
        "leaders": [
            { "name": "Sudesh Mahto", "photo": "https://example.com/leaders/ajsu/mahto.png", "order": 1 }
        ]
    }
];

async function seedParties() {
    try {
        // Wait for DB connection
        if (prithuDB.readyState !== 1) {
            await new Promise((resolve, reject) => {
                prithuDB.once("connected", resolve);
                prithuDB.once("error", reject);
            });
        }

        // Lookup for regional names
        const regionalNamesLookup = {};
        statesWithRegionalNames.forEach(item => {
            const [en, reg] = item.split(" – ").map(s => s.trim());
            regionalNamesLookup[en] = reg || "";
        });

        // Lookup for logos
        const logoLookup = {};
        partyLogos.forEach(item => {
            logoLookup[item.party] = item.logo;
        });

        // Lookup for leaders
        const leadersLookup = {};
        partyLeaders.forEach(item => {
            leadersLookup[item.party] = item.leaders;
        });

        console.log("🌱 Preparing party seed data...");

        const finalParties = [];
        partyData.forEach(item => {
            const regName = regionalNamesLookup[item.state] || "";
            item.parties.forEach(pName => {
                finalParties.push({
                    state: item.state,
                    stateRegionalName: regName,
                    partyName: pName,
                    partyShortName: pName.toUpperCase(),
                    partyLogo: logoLookup[pName] || `https://via.placeholder.com/150?text=${pName}`,
                    leaders: leadersLookup[pName] || [],
                    isActive: true
                });
            });
        });

        console.log(`🚀 Seeding ${finalParties.length} parties across ${partyData.length} states...`);

        for (const party of finalParties) {
            await Party.findOneAndUpdate(
                { state: party.state, partyName: party.partyName },
                party,
                { upsert: true, new: true }
            );
            console.log(`  + Seeded: ${party.state} -> ${party.partyName} (${party.leaders.length} leaders)`);
        }

        console.log(`\n✅ Successfully seeded ${finalParties.length} entries.`);
        process.exit(0);
    } catch (error) {
        console.error("❌ Seeding failed:", error);
        process.exit(1);
    }
}

seedParties();
