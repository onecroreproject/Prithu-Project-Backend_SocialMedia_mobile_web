const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const partySchema = new mongoose.Schema(
    {
        state: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        stateRegionalName: {
            type: String,
            trim: true
        },

        partyName: {
            type: String,
            required: true,
            trim: true
        },

        partyShortName: {
            type: String,
            trim: true,
            uppercase: true
        },

        partyLogo: {
            type: String,
            required: true
        },

        leaders: {
            type: [
                {
                    name: {
                        type: String,
                        required: true,
                        trim: true
                    },
                    photo: {
                        type: String
                    },
                    order: {
                        type: Number,
                        required: true,
                        min: 1,
                        max: 10
                    }
                }
            ],
            validate: [
                {
                    validator: function (val) {
                        return val.length <= 10;
                    },
                    message: "Maximum 10 leaders allowed"
                },
                {
                    validator: function (val) {
                        const orders = val.map(l => l.order);
                        return new Set(orders).size === orders.length;
                    },
                    message: "Leader order must be unique"
                }
            ]
        },

        isActive: {
            type: Boolean,
            default: true,
            index: true
        }
    },
    { timestamps: true }
);

// Unique party per state
partySchema.index({ state: 1, partyName: 1 }, { unique: true });

// Auto sort leaders by order before saving
partySchema.pre("save", function (next) {
    if (this.leaders && this.leaders.length > 0) {
        this.leaders.sort((a, b) => a.order - b.order);
    }
    next();
});

module.exports = prithuDB.model("Party", partySchema);
