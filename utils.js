const crypto = require('crypto');

module.exports = {
    generateUDID: () => {
        const r = () => Math.floor(Math.random() * (100000000 - 100000 + 1)) + 100000;
        return `S15${r()}${r()}${r()}${r()}`;
    },

    base64Encode: (str) => {
        return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    },

    generateCHK: (values) => {
        const salt = "0xPT6iUrtws0J";
        // Ensure values are concatenated exactly as strings
        const combined = values.map(v => v.toString()).join("") + salt;
        const sha1 = crypto.createHash('sha1').update(combined).digest('hex');
        const key = "29481";
        let result = "";
        for (let i = 0; i < sha1.length; i++) {
            result += String.fromCharCode(sha1.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return Buffer.from(result).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    },

    parseFriendRequests: (rawResponse) => {
        if (!rawResponse || rawResponse === "-1" || rawResponse === "") return [];

        const mainData = rawResponse.split('#')[0];
        const requestSegments = mainData.split('|');

        return requestSegments.map(req => {
            const parts = req.split(':');
            const data = {};

            for (let i = 0; i < parts.length; i += 2) {
                if (parts[i + 1] !== undefined) {
                    data[parts[i]] = parts[i + 1];
                }
            }

            let decodedMessage = "";
            if (data['35']) {
                try {
                    const b64 = data['35'].replace(/-/g, '+').replace(/_/g, '/');
                    decodedMessage = Buffer.from(b64, 'base64').toString('utf8');
                } catch (e) {
                    decodedMessage = "[Decode Error]";
                }
            }

            return {
                userName: data['1'] || "Unknown",
                playerID: data['2'] || "0",
                accountID: data['16'] || "0",
                friendRequestID: data['32'] || "0",
                message: decodedMessage,
                age: data['37'] || "Unknown",
                isNew: data['41'] === "1"
            };
        });
    },

    parseUser: (rawResponse) => {
        if (!rawResponse || rawResponse === "-1") return null;

        const mainData = rawResponse.split('#')[0];
        const parts = mainData.split(':');
        const data = {};

        for (let i = 0; i < parts.length; i += 2) {
            if (parts[i + 1] !== undefined) {
                data[parts[i]] = parts[i + 1];
            }
        }

        return {
            username: data['1'],
            userID: data['2'],
            stars: parseInt(data['3']) || 0,
            demons: parseInt(data['4']) || 0,
            creatorPoints: parseInt(data['8']) || 0,
            diamonds: parseInt(data['46']) || 0,
            moons: parseInt(data['52']) || 0,
            accountID: data['16'],
            globalRank: data['30'] || null,
            registered: data['29'] === '1',
            modLevel: parseInt(data['49']) || 0, // 0: None, 1: Mod, 2: Elder
            
            socials: {
                youtube: data['20'] || null,
                twitter: data['44'] || null,
                twitch: data['45'] || null,
                discord: data['58'] || null,
                instagram: data['59'] || null
            }
        };
    },

    /**
     * Parses a list of users (from getGJUsers20 / User Search)
     */
    parseUserSearch: (rawResponse) => {
        if (!rawResponse || rawResponse === "-1") return [];
        
        // Search results split multiple users with '|'
        const userSegments = rawResponse.split('#')[0].split('|');
        return userSegments.map(seg => module.exports.parseUser(seg)).filter(u => u !== null);
    },

    parseComments: (rawResponse) => {
        if (!rawResponse || rawResponse === "-1" || !rawResponse.includes('~')) return [];
        const mainData = rawResponse.split('#')[0];
        const commentSegments = mainData.split('|');
        
        return commentSegments.map(c => {
            const parts = c.split(':');
            const commentPart = parts[0].split('~');
            const userPart = parts[1] ? parts[1].split('~') : [];
            const obj = {};
            
            for (let i = 0; i < commentPart.length; i += 2) { if (commentPart[i+1]) obj[commentPart[i]] = commentPart[i + 1]; }
            for (let i = 0; i < userPart.length; i += 2) { if (userPart[i+1]) obj["u" + userPart[i]] = userPart[i + 1]; }

            let content = "";
            if (obj['2']) {
                try {
                    const b64 = obj['2'].replace(/-/g, '+').replace(/_/g, '/');
                    content = Buffer.from(b64, 'base64').toString('utf8').trim();
                } catch (e) { content = "[Decode Error]"; }
            }
            
            return {
                userName: obj["u1"] || "Unknown",
                commentID: obj['6'] || "0",
                percentage: obj['10'] || "0",
                date: obj['9'] || "Unknown",
                content: content
            };
        });
    }
};