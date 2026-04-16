const https = require('https');

const SECRETS = {
    common: "Wmfd2893gb7",
    account: "Wmfv3899gc9",
    level: "Wmfv2898gc9"
};

const BASE_DOMAIN = "www.boomlings.com";

async function makeRequest(endpoint, params, debug = false) {
    return new Promise((resolve) => {

        const body = new URLSearchParams(params).toString();

        if (debug) {
            console.log(`\n\x1b[1;36m[NETWORK ${endpoint}]\x1b[0m`);
            console.log(body);
        }

        const req = https.request({
            hostname: BASE_DOMAIN,
            path: `/database/${endpoint}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': ''
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        });

        req.on('error', (err) => {
            console.error("Network Error:", err.message);
            resolve("-1");
        });

        req.write(body);
        req.end();
    });
}

module.exports = { makeRequest, SECRETS };