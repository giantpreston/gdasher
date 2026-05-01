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
        const combined = values.map(v => v.toString()).join("") + salt;
        const sha1 = crypto.createHash('sha1').update(combined).digest('hex');
        const key = "29481";
        let result = "";
        for (let i = 0; i < sha1.length; i++) {
            result += String.fromCharCode(sha1.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return Buffer.from(result).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    },

    decodeLevelPassword: (encodedPass) => {
        if (!encodedPass) return null;
        try {
            const b64 = encodedPass.replace(/-/g, '+').replace(/_/g, '/');
            const decoded = Buffer.from(b64, 'base64').toString('utf8');
            const key = "26364";
            let result = "";
            for (let i = 0; i < decoded.length; i++) {
                result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result.length > 1 ? result.substring(1) : "0";
        } catch (e) { return null; }
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

    formatNumber: (num) => {
        if (num === null || num === undefined) return "0";

        const n = Number(num);
        if (isNaN(n)) return "0";

        return n.toLocaleString('en-US');
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
            secretCoins: parseInt(data['13']) || 0,
            userCoins: parseInt(data['17']) || 0,
            commentHistoryState: parseInt(data['50']) || 0, // Who can view this user's comment history. 0: All, 1: Friends Only, 2: None
            friendsState: parseInt(data['19']) || 0, // 0: All, 1: None
            messageState: parseInt(data['18']) || 0, // 0: All, 1: Friends Only, 2: None
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

            for (let i = 0; i < commentPart.length; i += 2) { if (commentPart[i + 1]) obj[commentPart[i]] = commentPart[i + 1]; }
            for (let i = 0; i < userPart.length; i += 2) { if (userPart[i + 1]) obj["u" + userPart[i]] = userPart[i + 1]; }

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
    },

    decodeMessageContent: (encodedStr) => {
        if (!encodedStr) return "";
        try {
            const b64 = encodedStr.replace(/-/g, '+').replace(/_/g, '/');
            const decoded = Buffer.from(b64, 'base64').toString('latin1');
            const key = "14251";
            let result = "";
            for (let i = 0; i < decoded.length; i++) {
                result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result;
        } catch (e) {
            return "[Decode Error]";
        }
    },

    parseMessages: (rawResponse) => {
        if (!rawResponse || rawResponse === "-1" || rawResponse === "") return [];

        const mainData = rawResponse.split('#')[0];
        const messageSegments = mainData.split('|');

        return messageSegments.map(msg => {
            const parts = msg.split(':');
            const data = {};

            for (let i = 0; i < parts.length; i += 2) {
                if (parts[i + 1] !== undefined) {
                    data[parts[i]] = parts[i + 1];
                }
            }

            let decodedTitle = "";
            if (data['4']) {
                try {
                    decodedTitle = Buffer.from(data['4'], 'base64').toString('utf8');
                } catch (e) { decodedTitle = "[Title Error]"; }
            }

            return {
                messageID: data['1'],
                accountID: data['2'],
                playerID: data['3'],
                userName: data['6'],
                subject: decodedTitle,
                // Only present if the message was downloaded via downloadGJMessage20
                body: data['5'] ? module.exports.decodeMessageContent(data['5']) : null,
                age: data['7'],
                isRead: data['8'] === '1',
                isSender: data['9'] === '1'
            };
        });
    },

    parseLevel: (rawResponse) => {
        if (!rawResponse || rawResponse === "-1") return null;

        const mainData = rawResponse.split('#')[0];
        const parts = mainData.split(':');
        const data = {};

        for (let i = 0; i < parts.length; i += 2) {
            if (parts[i + 1] !== undefined) {
                data[parts[i]] = parts[i + 1];
            }
        }

        let description = "";
        if (data['3']) {
            try {
                const b64 = data['3'].replace(/-/g, '+').replace(/_/g, '/');
                description = Buffer.from(b64, 'base64').toString('utf8');
            } catch (e) { description = ""; }
        }

        return {
            id: data['1'],
            name: data['2'],
            description: description,
            authorID: data['6'],
            version: parseInt(data['5']),
            difficulty: {
                numerator: parseInt(data['9']),
                denominator: parseInt(data['8']),
                isDemon: data['17'] === '1',
                isAuto: data['25'] === '1',
                demonDifficulty: parseInt(data['43']) || 0,
                epicType: parseInt(data['42']) || 0
            },
            stats: {
                downloads: parseInt(data['10']),
                likes: parseInt(data['14']),
                objects: parseInt(data['45']),
                stars: parseInt(data['18']),
                coins: parseInt(data['37']),
                verifiedCoins: data['38'] === '1'
            },
            music: {
                officialSong: parseInt(data['12']),
                customSongID: data['35'] || null
            },
            info: {
                length: parseInt(data['15']),
                gameVersion: parseInt(data['13']),
                uploadDate: data['28'],
                updateDate: data['29'],
                password: module.exports.decodeLevelPassword(data['27']),
                editorTime: parseInt(data['46']) || 0,
                dailyNumber: parseInt(data['41']) || 0
            },
            levelString: data['4'] || null
        };
    },

    parseLevelSearch: (rawResponse) => {
        if (!rawResponse || rawResponse === "-1") return [];
        const levelSegments = rawResponse.split('#')[0].split('|');
        return levelSegments.map(seg => module.exports.parseLevel(seg)).filter(l => l !== null);
    }
};