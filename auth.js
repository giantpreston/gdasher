const fs = require('fs');
const crypto = require('crypto');

const AUTH_FILE = './auth.dat';
const GJP2_SALT = "mI29fmAnxgTs";

/**
 * These are "Lone Surrogates" (UTF-16) and illegal UTF-8 bytes.
 * Notepad physically cannot map these to a valid text character,
 * so it will replace them with '?' (0x3F) or similar when saving.
 */
const MARKERS = {
    username: 0xD8,  // High Surrogate start
    gjp2: 0xDD,      // Low Surrogate start
    accountID: 0xFF, // Pure binary / invalid UTF-8
    playerID: 0x80   // Illegal trailing byte
};

const TERMINATOR = 0x00; // Null byte is still the king of breaking text editors

module.exports = {
    generateGJP2: (password) => {
        return crypto.createHash('sha1').update(password + GJP2_SALT).digest('hex');
    },

    saveAuth: (data) => {
        const chunks = [];
        Object.entries(MARKERS).forEach(([key, byteMarker]) => {
            if (data[key]) {
                chunks.push(Buffer.from([byteMarker]));
                chunks.push(Buffer.from(data[key].toString(), 'utf8'));
                chunks.push(Buffer.from([TERMINATOR]));
            }
        });
        fs.writeFileSync(AUTH_FILE, Buffer.concat(chunks));
    },

    loadAuth: () => {
        if (!fs.existsSync(AUTH_FILE)) return null;
        const buffer = fs.readFileSync(AUTH_FILE);
        const result = {};

        Object.entries(MARKERS).forEach(([key, byteMarker]) => {
            const start = buffer.indexOf(byteMarker);
            // If Notepad changed our marker to 0x3F (?), this will fail to find it.
            if (start !== -1) {
                const end = buffer.indexOf(TERMINATOR, start + 1);
                if (end !== -1) {
                    result[key] = buffer.slice(start + 1, end).toString('utf8');
                }
            }
        });

        return (result.username && result.gjp2) ? result : null;
    }
};