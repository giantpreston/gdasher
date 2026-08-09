const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

module.exports = {
    generateUDID: () => {
        const r = () => Math.floor(Math.random() * (100000000 - 100000 + 1)) + 100000;
        return `S15${r()}${r()}${r()}${r()}`;
    },

    sanitizeFileName: (name, fallback = 'song') => {
        if (!name && !fallback) return 'song';

        const raw = String(name || fallback);
        const lastDot = raw.lastIndexOf('.');
        const extension = lastDot > 0 && lastDot > raw.lastIndexOf('/') && lastDot > raw.lastIndexOf('\\')
            ? raw.slice(lastDot).toLowerCase()
            : '';

        const base = raw.slice(0, extension ? lastDot : raw.length)
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
            .trim()
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .replace(/\.+$/g, '');

        const sanitizedBase = (base || fallback).slice(0, 120 - extension.length);
        return `${sanitizedBase}${extension}`;
    },

    getFileExtensionFromUrl: (url, fallback = '') => {
        if (!url) return fallback;
        try {
            const parsed = new URL(url);
            const match = parsed.pathname.match(/\.([a-z0-9]+)(?:$|[?#])/i);
            if (match) return `.${match[1].toLowerCase()}`;
        } catch (e) {
            const match = String(url).match(/\.([a-z0-9]+)(?:$|[?#])/i);
            if (match) return `.${match[1].toLowerCase()}`;
        }
        return fallback;
    },

    getVersion: () =>
        new Promise((resolve, reject) => {
            https.get(
                'https://raw.githubusercontent.com/giantpreston/gdasher/refs/heads/main/version.txt',
                (res) => {
                    let data = '';

                    res.on('data', (chunk) => (data += chunk));
                    res.on('end', () => resolve(data));
                }
            ).on('error', reject);
        }),

    createGMD: (name, creator, customSong, officialSng, level) => {
        const now = new Date();
        const fileName = `level_${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}_${Math.floor(Math.random() * (17381927 - 1829) + 1829)}.gmd`;

        let songData = "";

        if (customSong) {
            songData = `<k>k45</k><i>${customSong}</i>`;
        } else if (officialSng && officialSng !== 0) {
            songData = `<k>k8</k><i>${officialSng}</i>`;
        }

        const xml = `<?xml version="1.0"?><plist version="1.0" gjver="2.0"><dict><k>kCEK</k><i>4</i><k>k18</k><i>1</i><k>k36</k><i>7</i><k>k2</k><s>${module.exports._xmlEscape(name)}</s><k>k4</k><s>${module.exports._xmlEscape(level)}</s><k>k5</k><s>${module.exports._xmlEscape(creator)}</s><k>k101</k><s>0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0</s><k>k11</k><i>66</i><k>k13</k><t /><k>k21</k><i>2</i><k>k16</k><i>1</i><k>k80</k><i>41</i><k>k27</k><i>66</i><k>k50</k><i>47</i><k>k47</k><t /><k>k48</k><i>1</i>${songData}</dict></plist>`;

        fs.writeFile(fileName, xml, (err) => {
            if (err) throw err;
        });

        return fileName;
    },

    base64Encode: (str) => {
        return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    },

    _stripAnsiAndControl: (str) => {
        if (typeof str !== 'string') return str;
        let out = str.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
        out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
        return out;
    },

    _xmlEscape: (str) => {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&apos;');
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
                    decodedMessage = module.exports._stripAnsiAndControl(decodedMessage);
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
            username: module.exports._stripAnsiAndControl(data['1'] || ''),
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
                    content = module.exports._stripAnsiAndControl(content);
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

    parseSong: (rawResponse) => {
        if (!rawResponse || rawResponse === "-1" || rawResponse === "") return null;

        const mainData = rawResponse.split('#')[0];
        const pairs = [];

        const segments = mainData.includes(':') && mainData.includes('~|~')
            ? mainData.split(':')
            : mainData.includes('~|~')
                ? mainData.split('~|~')
                : [];

        if (segments.length > 0) {
            for (const segment of segments) {
                if (!segment || !segment.includes('~|~')) continue;
                const [rawKey, ...rawValueParts] = segment.split('~|~');
                const key = rawKey.trim();
                const value = rawValueParts.join('~|~').trim();
                if (key) pairs.push([key, value]);
            }
        }

        if (pairs.length === 0 && mainData.includes('~|~')) {
            const rawPairs = mainData.split('~|~');
            for (let i = 0; i < rawPairs.length - 1; i += 2) {
                if (rawPairs[i] !== undefined && rawPairs[i + 1] !== undefined) {
                    pairs.push([rawPairs[i], rawPairs[i + 1]]);
                }
            }
        }

        const data = {};
        const fieldMap = {
            1: 'id',
            2: 'name',
            3: 'artistID',
            4: 'artistName',
            5: 'size',
            6: 'videoID',
            7: 'youtubeURL',
            8: 'isVerified',
            9: 'songPriority',
            10: 'link',
            11: 'nongEnum',
            12: 'extraArtistIDs',
            13: 'isNew',
            14: 'newType',
            15: 'extraArtistNames',
            16: 'downloadSoundtrackOverride'
        };

        const decodeValue = (value) => {
            if (value === null || value === undefined) return value;
            if (typeof value !== 'string') return value;

            let decoded = value;
            try {
                decoded = decodeURIComponent(value);
            } catch (e) {
                decoded = value;
            }

            if (decoded === "0" || decoded === "1") {
                return decoded === "1";
            }

            if (/^\d+(\.\d+)?$/.test(decoded)) {
                return decoded.includes('.') ? parseFloat(decoded) : parseInt(decoded, 10);
            }

            return decoded;
        };

        for (const [key, value] of pairs) {
            const normalizedKey = String(key).trim();
            if (!normalizedKey) continue;

            const fieldName = fieldMap[normalizedKey] || `key${normalizedKey}`;
            let parsedValue = decodeValue(value);

            if (fieldName === 'extraArtistIDs' && typeof parsedValue === 'string' && parsedValue !== '') {
                parsedValue = parsedValue.split('.').map(v => {
                    const trimmed = v.trim();
                    return trimmed ? parseInt(trimmed, 10) : null;
                }).filter(v => v !== null);
            }

            if (fieldName === 'extraArtistNames' && typeof parsedValue === 'string' && parsedValue !== '') {
                parsedValue = parsedValue.split(',').map(v => v.trim()).filter(Boolean);
            }

            data[fieldName] = parsedValue;
        }

        return {
            id: data.id || null,
            name: data.name || null,
            artistID: data.artistID || null,
            artistName: data.artistName || null,
            size: data.size || null,
            videoID: data.videoID || null,
            youtubeURL: data.youtubeURL || null,
            isVerified: data.isVerified ?? false,
            songPriority: data.songPriority || null,
            link: data.link || null,
            nongEnum: data.nongEnum || null,
            extraArtistIDs: Array.isArray(data.extraArtistIDs) ? data.extraArtistIDs : [],
            isNew: data.isNew ?? false,
            newType: data.newType || null,
            extraArtistNames: Array.isArray(data.extraArtistNames) ? data.extraArtistNames : [],
            downloadSoundtrackOverride: data.downloadSoundtrackOverride || null,
            raw: data
        };
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
            return module.exports._stripAnsiAndControl(result);
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
                    decodedTitle = module.exports._stripAnsiAndControl(decodedTitle);
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

    parseLevel: async (rawResponse, fetchUserInfo = null, creatorInfo = null) => {
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
                description = module.exports._stripAnsiAndControl(description);
            } catch (e) { description = ""; }
        }

        let gameVersion = "Unknown";
        if (data['13']) {
            const versionNum = parseInt(data['13']);
            if (versionNum >= 10) {
                const major = Math.floor(versionNum / 10);
                const minor = versionNum % 10;
                gameVersion = `${major}.${minor}`;
            } else if (versionNum >= 1 && versionNum <= 7) {
                gameVersion = `1.${versionNum}`;
            } else if (versionNum === 10) {
                gameVersion = "1.7";
            }
        }

        let username = "Unknown";
        let accountID = null;
        const playerID = data['6'] || "0";

        const hasCreatorInfo = creatorInfo && (creatorInfo.username || creatorInfo.accountID !== undefined && creatorInfo.accountID !== null);

        if (hasCreatorInfo) {
            username = creatorInfo.username || "Unknown";
            accountID = creatorInfo.accountID || null;
        } else if (fetchUserInfo && typeof fetchUserInfo === 'function') {
            try {
                const userInfo = await fetchUserInfo(playerID);
                if (userInfo) {
                    username = userInfo.username || "Unknown";
                    accountID = userInfo.accountID || null;
                }
            } catch (e) {
                console.error(`Failed to fetch user info for playerID ${playerID}:`, e);
            }
        }
        const difficultyNumerator = parseInt(data['9']) || 0;
        const difficultyDenominator = parseInt(data['8']) || 0;
        const isDemon = data['17'] === '1';
        const isAuto = data['25'] === '1';
        const demonDifficultyValue = parseInt(data['43']) || 0;
        const epicValue = parseInt(data['42']) || 0;

        let difficultyName = "N/A";
        let difficultyIcon = 0; // 0=N/A, 10=easy, 20=normal, 30=hard, 40=harder, 50=insane

        if (isAuto) {
            difficultyName = "Auto";
            difficultyIcon = 0;
        } else if (isDemon) {
            const demonNames = {
                3: "Easy Demon",
                4: "Medium Demon",
                0: "Hard Demon",
                5: "Insane Demon",
                6: "Extreme Demon"
            };
            difficultyName = demonNames[demonDifficultyValue] || "Demon";
            difficultyIcon = 50; // Demons show as 50 (insane) but have demon overlay
        } else if (difficultyDenominator === 10 && difficultyNumerator > 0) {
            // Normal difficulty calculation
            if (difficultyNumerator === 10) {
                difficultyName = "Easy";
                difficultyIcon = 10;
            } else if (difficultyNumerator === 20) {
                difficultyName = "Normal";
                difficultyIcon = 20;
            } else if (difficultyNumerator === 30) {
                difficultyName = "Hard";
                difficultyIcon = 30;
            } else if (difficultyNumerator === 40) {
                difficultyName = "Harder";
                difficultyIcon = 40;
            } else if (difficultyNumerator === 50) {
                difficultyName = "Insane";
                difficultyIcon = 50;
            }
        }

        let epicRating = "None";
        if (epicValue === 1) epicRating = "Epic";
        else if (epicValue === 2) epicRating = "Legendary";
        else if (epicValue === 3) epicRating = "Mythic";

        const lengthValue = parseInt(data['15']) || 0;
        const lengthNames = ["Tiny", "Short", "Medium", "Long", "XL", "Plat"];
        const lengthName = lengthNames[lengthValue] || "Unknown";

        const featureScore = parseInt(data['19']) || 0;
        let featuredStatus = "Not Featured";
        if (featureScore > 0) {
            featuredStatus = "Featured";
        }

        let dailyNumber = parseInt(data['41']) || 0;
        let isWeekly = false;
        if (dailyNumber >= 100000) {
            isWeekly = true;
            dailyNumber -= 100000;
        }

        const coins = parseInt(data['37']) || 0;
        const verifiedCoins = data['38'] === '1';
        const starsRequested = parseInt(data['39']) || 0;

        const editorTimeSeconds = parseInt(data['46']) || 0;
        const editorTimeCopiesSeconds = parseInt(data['47']) || 0;
        const verificationFrames = parseInt(data['57']) || 0;

        const formatTime = (seconds) => {
            if (!seconds) return "0 seconds";
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            const parts = [];
            if (hours > 0) parts.push(`${hours}h`);
            if (minutes > 0) parts.push(`${minutes}m`);
            if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
            return parts.join(' ');
        };

        const verificationSeconds = Math.floor(verificationFrames / 240);
        const verificationTime = formatTime(verificationSeconds);

        // ========== OBJECT COUNT WARNING ==========
        const objects = parseInt(data['45']) || 0;
        const isLargeLevel = objects > 40000;

        // ========== CREATOR POINTS CALCULATION ==========
        const hasStars = (parseInt(data['18']) || 0) > 0;
        const isFeatured = featureScore > 0;
        const isEpic = epicValue > 0;
        const creatorPoints = (hasStars ? 1 : 0) + (isFeatured ? 1 : 0) + (isEpic ? 1 : 0);

        return {
            levelID: data['1'] || "0",
            levelName: module.exports._stripAnsiAndControl(data['2'] || "Unnamed"),
            description: description,
            levelString: data['4'] || null,
            version: parseInt(data['5']) || 0,

            author: {
                username: username,
                playerID: playerID,
                accountID: accountID,
                creatorPoints: creatorPoints
            },

            difficulty: {
                name: difficultyName,
                icon: difficultyIcon,
                rawNumerator: difficultyNumerator,
                rawDenominator: difficultyDenominator,
                isDemon: isDemon,
                demonDifficulty: demonDifficultyValue,
                demonName: isDemon ? difficultyName : null,
                isAuto: isAuto
            },

            rating: {
                stars: parseInt(data['18']) || 0,
                featureScore: featureScore,
                featuredStatus: featuredStatus,
                epic: epicValue,
                epicRating: epicRating,
                isGauntlet: data['44'] === '1'
            },

            stats: {
                downloads: parseInt(data['10']) || 0,
                likes: parseInt(data['14']) || 0,
                dislikes: parseInt(data['16']) || 0,
                likedScore: (parseInt(data['14']) || 0) - (parseInt(data['16']) || 0),
                objects: objects,
                isLargeLevel: isLargeLevel,
                lowDetailMode: data['40'] === '1'
            },

            coins: {
                total: coins,
                verified: verifiedCoins,
                starsRequested: starsRequested
            },

            music: {
                officialSong: parseInt(data['12']) || null,
                customSongID: data['35'] || null,
                songIDs: data['52'] ? data['52'].split(',') : [],
                sfxIDs: data['53'] ? data['53'].split(',') : []
            },

            info: {
                length: {
                    value: lengthValue,
                    name: lengthName
                },
                gameVersion: gameVersion,
                twoPlayer: data['31'] === '1',
                copiedID: data['30'] || null,
                uploadDate: data['28'] || "Unknown",
                updateDate: data['29'] || "Unknown",
                editorTime: {
                    seconds: editorTimeSeconds,
                    readable: formatTime(editorTimeSeconds)
                },
                editorTimeCopies: {
                    seconds: editorTimeCopiesSeconds,
                    readable: formatTime(editorTimeCopiesSeconds)
                },
                totalEditTime: {
                    seconds: editorTimeSeconds + editorTimeCopiesSeconds,
                    readable: formatTime(editorTimeSeconds + editorTimeCopiesSeconds)
                }
            },
            special: {
                isDaily: dailyNumber > 0 && !isWeekly,
                isWeekly: isWeekly,
                dailyNumber: dailyNumber > 0 ? dailyNumber : null,
                verificationTime: {
                    frames: verificationFrames,
                    seconds: verificationSeconds,
                    readable: verificationTime
                }
            },


            password: module.exports.decodeLevelPassword(data['27']),
            hasPassword: !!module.exports.decodeLevelPassword(data['27']) && module.exports.decodeLevelPassword(data['27']) !== "0",

            extraString: data['36'] || null,
            settingsString: data['48'] || null,
            recordString: data['26'] || null
        };
    },

    parseLevelSearch: async (rawResponse, fetchUserInfo = null) => {
        if (!rawResponse || rawResponse === "-1") return [];

        const responseSections = rawResponse.split('#');
        const mainData = responseSections[0] || "";
        if (!mainData || mainData === "") return [];

        const levelSegments = mainData.split('|');
        const creatorSegments = (responseSections[1] || "")
            .split('|')
            .filter(Boolean)
            .map(seg => {
                const parts = seg.split(':');
                return {
                    playerID: parts[0] || null,
                    username: parts[1] || null,
                    accountID: parts[2] || null
                };
            });

        const creatorLookup = new Map(
            creatorSegments
                .filter(creator => creator.playerID)
                .map(creator => [String(creator.playerID), creator])
        );

        const levels = [];
        for (const [index, seg] of levelSegments.entries()) {
            if (seg && seg.trim() !== "") {
                const levelParts = seg.split(':');
                const levelData = {};
                for (let i = 0; i < levelParts.length; i += 2) {
                    if (levelParts[i + 1] !== undefined) {
                        levelData[levelParts[i]] = levelParts[i + 1];
                    }
                }

                const playerID = levelData['6'] || null;
                const creatorInfo = creatorLookup.get(String(playerID)) || creatorSegments[index] || null;
                const level = await module.exports.parseLevel(seg, fetchUserInfo, creatorInfo);
                if (level !== null) levels.push(level);
            }
        }
        return levels;
    },
};