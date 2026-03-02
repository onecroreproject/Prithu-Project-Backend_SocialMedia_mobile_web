const Party = require("../../models/partyModel");
const { getMediaUrl } = require("../../utils/storageEngine");

// GET /web/api/parties/states
// Returns sorted distinct state objects { state, stateRegionalName } for active parties
exports.getStates = async (req, res) => {
    try {
        // Aggregate to get unique state + stateRegionalName pairs
        const stateData = await Party.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: "$state", stateRegionalName: { $first: "$stateRegionalName" } } },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, state: "$_id", stateRegionalName: 1 } }
        ]);
        res.status(200).json({ success: true, data: stateData });
    } catch (error) {
        console.error("[PublicParty] getStates error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /web/api/parties/by-state/:state
// Returns all active parties for a given state, with full media URLs
exports.getPartiesByState = async (req, res) => {
    try {
        const { state } = req.params;
        const parties = await Party.find({ state, isActive: true }).sort({ partyName: 1 });

        const enriched = parties.map(p => {
            const obj = p.toObject();
            return {
                ...obj,
                partyLogo: getMediaUrl(obj.partyLogo),
                leaders: (obj.leaders || []).map(l => ({
                    ...l,
                    photo: getMediaUrl(l.photo)
                }))
            };
        });

        res.status(200).json({ success: true, data: enriched });
    } catch (error) {
        console.error("[PublicParty] getPartiesByState error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /web/api/parties/:partyId/leaders
// Returns the leaders array for a single party (with media URLs)
exports.getLeadersByParty = async (req, res) => {
    try {
        const { partyId } = req.params;
        const party = await Party.findById(partyId);
        if (!party) return res.status(404).json({ success: false, message: "Party not found" });

        const leaders = (party.leaders || []).map(l => ({
            _id: l._id,
            name: l.name,
            photo: getMediaUrl(l.photo),
            order: l.order
        }));

        res.status(200).json({ success: true, partyName: party.partyName, data: leaders });
    } catch (error) {
        console.error("[PublicParty] getLeadersByParty error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
