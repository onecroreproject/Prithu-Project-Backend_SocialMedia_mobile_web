const Party = require("../../models/partyModel");
const fs = require("fs");
const path = require("path");
const { prithuDB } = require("../../database");
const { getMediaUrl } = require("../../utils/storageEngine");

/**
 * Save base64 or buffer to a specific path
 */
const savePartyFile = (fileData, targetDir, fileName) => {
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, fileName);

    // If it's a buffer (from multer memoryStorage)
    if (Buffer.isBuffer(fileData)) {
        fs.writeFileSync(filePath, fileData);
    }
    // If it's a base64 string
    else if (typeof fileData === 'string' && fileData.startsWith('data:')) {
        const base64Data = fileData.split(';base64,').pop();
        fs.writeFileSync(filePath, base64Data, { encoding: 'base64' });
    }

    // Return relative path for DB
    const relativePath = path.relative(path.join(__dirname, "../../"), filePath).replace(/\\/g, '/');
    return relativePath;
};

exports.getAllParties = async (req, res) => {
    try {
        const parties = await Party.find().sort({ state: 1, partyName: 1 });
        const enrichedParties = parties.map(p => {
            const party = p.toObject();
            return {
                ...party,
                partyLogo: getMediaUrl(party.partyLogo),
                leaders: party.leaders.map(leader => ({
                    ...leader,
                    photo: getMediaUrl(leader.photo)
                }))
            };
        });
        res.status(200).json({ success: true, data: enrichedParties });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createParty = async (req, res) => {
    try {
        const { state, partyName, partyShortName, stateRegionalName, leaders: leadersRaw, isActive } = req.body;
        const partyLogoFile = req.files?.['partyLogo']?.[0];
        const leaderPhotoFiles = req.files?.['leaderPhotos'] || [];
        // leaderPhotoIndices: a parallel array telling us which leader each photo belongs to
        const leaderPhotoIndices = [].concat(req.body.leaderPhotoIndices || []).map(Number);

        if (!state || !partyName || !partyLogoFile) {
            return res.status(400).json({ success: false, message: "State, Party Name and Logo are required" });
        }

        const sanitizedState = state.replace(/\s+/g, '_');
        const sanitizedPartyName = partyName.replace(/\s+/g, '_');
        const baseDir = path.join(__dirname, "../../uploads/parties", sanitizedState, sanitizedPartyName);

        // Save Party Logo
        const logoExt = path.extname(partyLogoFile.originalname) || '.jpg';
        const partyLogoPath = savePartyFile(partyLogoFile.buffer, baseDir, `logo${logoExt}`);

        // Process Leaders
        const leaders = JSON.parse(leadersRaw || "[]");
        const processedLeaders = leaders.map((leader, index) => {
            // Find the photo file for this leader using the index map
            const photoFileIdx = leaderPhotoIndices.indexOf(index);
            const photoFile = photoFileIdx !== -1 ? leaderPhotoFiles[photoFileIdx] : null;
            let photoPath = leader.photo || null;

            if (photoFile) {
                const leaderDir = path.join(baseDir, "leaders");
                const photoExt = path.extname(photoFile.originalname) || '.jpg';
                photoPath = savePartyFile(photoFile.buffer, leaderDir, `leader_${index}${photoExt}`);
            }

            return {
                name: leader.name,
                order: leader.order || (index + 1),
                photo: photoPath
            };
        });

        const newParty = new Party({
            state,
            partyName,
            partyShortName,
            stateRegionalName,
            partyLogo: partyLogoPath,
            leaders: processedLeaders,
            isActive: isActive !== undefined ? isActive === 'true' || isActive === true : true,
        });

        await newParty.save();
        // Enrich response with full media URLs (same as getAllParties)
        const obj = newParty.toObject();
        const enriched = {
            ...obj,
            partyLogo: getMediaUrl(obj.partyLogo),
            leaders: obj.leaders.map(l => ({ ...l, photo: getMediaUrl(l.photo) }))
        };
        res.status(201).json({ success: true, data: enriched });
    } catch (error) {
        console.error("Create Party Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateParty = async (req, res) => {
    try {
        const { id } = req.params;
        const { state, partyName, partyShortName, stateRegionalName, leaders: leadersRaw, isActive } = req.body;
        const partyLogoFile = req.files?.['partyLogo']?.[0];
        const leaderPhotoFiles = req.files?.['leaderPhotos'] || [];
        // leaderPhotoIndices: parallel array telling us which leader each photo belongs to
        const leaderPhotoIndices = [].concat(req.body.leaderPhotoIndices || []).map(Number);

        const party = await Party.findById(id);
        if (!party) return res.status(404).json({ success: false, message: "Party not found" });

        const sanitizedState = (state || party.state).replace(/\s+/g, '_');
        const sanitizedPartyName = (partyName || party.partyName).replace(/\s+/g, '_');
        const baseDir = path.join(__dirname, "../../uploads/parties", sanitizedState, sanitizedPartyName);

        let partyLogoPath = party.partyLogo;
        if (partyLogoFile) {
            const logoExt = path.extname(partyLogoFile.originalname) || '.jpg';
            partyLogoPath = savePartyFile(partyLogoFile.buffer, baseDir, `logo${logoExt}`);
        }

        const leaders = JSON.parse(leadersRaw || "[]");
        const processedLeaders = leaders.map((leader, index) => {
            // Find the photo file for this leader using the index map
            const photoFileIdx = leaderPhotoIndices.indexOf(index);
            const photoFile = photoFileIdx !== -1 ? leaderPhotoFiles[photoFileIdx] : null;
            let photoPath = leader.photo || null;

            if (photoFile) {
                const leaderDir = path.join(baseDir, "leaders");
                const photoExt = path.extname(photoFile.originalname) || '.jpg';
                photoPath = savePartyFile(photoFile.buffer, leaderDir, `leader_${index}${photoExt}`);
            }

            return {
                name: leader.name,
                order: leader.order || (index + 1),
                photo: photoPath,
            };
        });

        const updatedData = {
            state: state || party.state,
            partyName: partyName || party.partyName,
            partyShortName: partyShortName || party.partyShortName,
            stateRegionalName: stateRegionalName || party.stateRegionalName,
            partyLogo: partyLogoPath,
            leaders: processedLeaders,
            isActive: isActive !== undefined ? isActive : party.isActive
        };

        const updatedParty = await Party.findByIdAndUpdate(id, updatedData, { new: true });
        // Enrich response with full media URLs (same as getAllParties)
        const obj = updatedParty.toObject();
        const enriched = {
            ...obj,
            partyLogo: getMediaUrl(obj.partyLogo),
            leaders: obj.leaders.map(l => ({ ...l, photo: getMediaUrl(l.photo) }))
        };
        res.status(200).json({ success: true, data: enriched });
    } catch (error) {
        console.error("Update Party Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteParty = async (req, res) => {
    try {
        const { id } = req.params;
        await Party.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Party deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
