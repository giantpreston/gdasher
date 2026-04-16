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