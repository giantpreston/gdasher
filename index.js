const fs = require("fs").promises;
const readline = require('readline');
const auth = require('./auth');
const network = require('./network');
const utils = require('./utils');

const VERSION = "0.0.8-alpha";
const DEBUG = process.argv.includes('--debug');

function debug(title, data) {
    if (!DEBUG) return;
    console.log(`\n\x1b[1;35m[DEBUG] ${title}\x1b[0m`);
    console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

const ASCII = `\x1b[94m
  /$$$$$$  /$$$$$$$                      /$$                          
 /$$__  $$| $$__  $$                    | $$                          
| $$  \\__/| $$  \\ $$  /$$$$$$   /$$$$$$$| $$$$$$$   /$$$$$$   /$$$$$$ 
| $$ /$$$$| $$  | $$ |____  $$ /$$_____/| $$__  $$ /$$__  $$ /$$__  $$
| $$|_  $$| $$  | $$  /$$$$$$$|  $$$$$$ | $$  \\ $$| $$$$$$$$| $$  \\__/
| $$  \\ $$| $$  | $$ /$$__  $$ \\____  $$| $$  | $$| $$_____/| $$      
|  $$$$$$/| $$$$$$$/|  $$$$$$$ /$$$$$$$/| $$  | $$|  $$$$$$$| $$      
 \\______/ |_______/  \\_______/|_______/ |__/  |__/ \\_______/|__/      \x1b[0m`;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (q) => new Promise(r => rl.question(`\x1b[1;37m${q}\x1b[0m`, r));

/** ---------------- MASKED INPUT HELPER ---------------- **/

function hiddenQuestion(query) {
    return new Promise((resolve, reject) => {
        const stdin = process.stdin;
        const stdout = process.stdout;

        const initialRawMode = stdin.isRaw;
        let wasResumed = false;
        let input = "";

        const cleanup = () => {
            try {
                stdin.setRawMode(initialRawMode);
                if (!wasResumed && !stdin.readableFlowing) {
                    stdin.pause();
                }
            } catch (e) {
                // stdin might already be closed
            }
        };

        const redisplay = () => {
            stdout.clearLine(0);
            stdout.cursorTo(0);
            stdout.write(`\x1b[1;37m${query}\x1b[0m${"*".repeat(input.length)}`);
        };

        const onData = (chunk) => {
            // Process byte-by-byte to handle rapid input correctly
            for (let i = 0; i < chunk.length; i++) {
                const byte = chunk[i];
                
                if (byte === 0x0A || byte === 0x0D || byte === 0x04) { // \n, \r, EOF
                    stdin.removeListener("data", onData);
                    cleanup();
                    stdout.write("\n");
                    resolve(input);
                    return;
                } else if (byte === 0x03) { // Ctrl+C
                    stdin.removeListener("data", onData);
                    cleanup();
                    reject(new Error("Input cancelled"));
                    return;
                } else if (byte === 0x7F || byte === 0x08) { // Backspace or \b
                    if (input.length > 0) {
                        input = input.slice(0, -1);
                        redisplay();
                    }
                } else if (byte >= 0x20 && byte < 0x7F) { // Printable ASCII
                    input += String.fromCharCode(byte);
                    redisplay();
                }
            }
        };

        try {
            wasResumed = stdin.readableFlowing !== false;
            stdout.write(`\x1b[1;37m${query}\x1b[0m`);
            stdin.setRawMode(true);
            stdin.resume();
            stdin.on("data", onData);
        } catch (e) {
            reject(e);
        }
    });
}

const scene = (title) => {
    process.stdout.write('\x1b[2J\x1b[H');
    console.log(ASCII);
    console.log(`\x1b[44m\x1b[1;37m  ${title.toUpperCase().padEnd(60)}  \x1b[0m\n`);
};

/** ---------------- INITIAL FLOW ---------------- **/

async function startFlow() {
    process.title = "GDasher | Not logged in";
    scene("Welcome to GDasher");
    
    console.log(` \x1b[1;36m[1]\x1b[0m Login`);
    console.log(` \x1b[1;36m[2]\x1b[0m Register New Account`);
    console.log(` \x1b[1;31m[3]\x1b[0m Exit\n`);

    const choice = await question("\x1b[1;35mCHOICE > \x1b[0m");

    if (choice === '1') return loginFlow();
    if (choice === '2') return registerFlow();
    if (choice === '3') process.exit();
    
    startFlow();
}

/** ---------------- REGISTRATION ---------------- **/

async function registerFlow() {
    scene("Account Registration");

    let userName = await question("Username (type 'cancel' to leave): ");
    if (userName == "cancel") {
        return startFlow();
    }
    if (!userName.trim()) {
        console.log("\x1b[31mUsername cannot be blank.\x1b[0m");
        await question("[Press Enter]");
        return registerFlow();
    }

    let password = await hiddenQuestion("Password: ");
    if (!password.trim()) {
        console.log("\x1b[31mPassword cannot be blank.\x1b[0m");
        await question("[Press Enter]");
        return registerFlow();
    }

    let email = await question("Email: ");
    if (!email.trim()) {
        console.log("\x1b[31mEmail cannot be blank.\x1b[0m");
        await question("[Press Enter]");
        return registerFlow();
    }

    userName = userName.trim();
    password = password.trim();
    email = email.trim();

    const res = await network.makeRequest('accounts/registerGJAccount.php', {
        userName, password, email, secret: network.SECRETS.account
    }, DEBUG);

    if (res === "1") {
        console.log(`\n\x1b[32mSuccess! Check ${email} for a link to activate your account.\x1b[0m`);
        await new Promise(r => setTimeout(r, 4000));
        startFlow();
    } else {
        const errorMap = {
            "-2": "Username taken",
            "-3": "Email taken",
            "-4": "Username too long",
            "-5": "Invalid password",
            "-6": "Invalid email",
            "-8": "Password too short",
            "-9": "Username too short"
        };
        console.log(`\n\x1b[31mRegistration Failed: ${errorMap[res] || `Error ${res}`}\x1b[0m`);
        await question("\n[Press Enter]");
        startFlow();
    }
}

/** ---------------- LOGIN ---------------- **/

async function loginFlow() {
    process.title = "GDasher | Not logged in";
    scene("Account Login");

    let userName = await question("Username (type 'cancel' to leave): ");
    if (userName == "cancel") {
        return startFlow();
    }
    if (!userName.trim()) {
        console.log("\x1b[31mUsername cannot be blank.\x1b[0m");
        await question("[Press Enter]");
        return loginFlow();
    }

    let password = await hiddenQuestion("Password: ");
    if (!password.trim()) {
        console.log("\x1b[31mPassword cannot be blank.\x1b[0m");
        await question("[Press Enter]");
        return loginFlow();
    }

    userName = userName.trim();
    password = password.trim();

    const gjp2 = auth.generateGJP2(password);

    const response = await network.makeRequest('accounts/loginGJAccount.php', {
        userName, gjp2, udid: utils.generateUDID(), secret: network.SECRETS.account
    }, DEBUG);

    if (response.includes(',')) {
        const [accountID, playerID] = response.split(',');
        const userData = { username: userName, gjp2, accountID, playerID };
        auth.saveAuth(userData);
        console.log("\x1b[32m\nLogin successful!\x1b[0m");
        mainMenu(userData);
    } else {
        console.log(`\x1b[31m\nLogin Failed (${response})\x1b[0m`);
        await question("Press Enter...");
        startFlow();
    }
}

/** ---------------- HELPERS ---------------- **/

function formatBanTime(seconds) {
    seconds = parseInt(seconds) || 0;
    const units = [
        { label: "year", val: 31536000 },
        { label: "month", val: 2592000 },
        { label: "day", val: 86400 },
        { label: "hour", val: 3600 },
        { label: "minute", val: 60 },
        { label: "second", val: 1 }
    ];
    const parts = [];
    units.forEach(u => {
        const count = Math.floor(seconds / u.val);
        if (count) {
            parts.push(`${count} ${u.label}${count !== 1 ? "s" : ""}`);
            seconds %= u.val;
        }
    });
    return parts.length ? parts.join(", ") : "0 seconds";
}

/** ---------------- LEVEL COMMENTS ---------------- **/

async function viewLevelComments() {
    scene("View Level Comments");
    let levelID = await question("Level ID (type 'cancel' to leave): ");
    if (levelID == "cancel") {
        const savedData = auth.loadAuth();
        return mainMenu(savedData);
    }
    if (!levelID.trim() || isNaN(parseInt(levelID))) {
        console.log("\x1b[31mLevel ID must be a valid number.\x1b[0m");
        await question("[Press Enter]");
        return viewLevelComments();
    }
    let mode = await question("Mode (0:Recent, 1:Liked): ") || "0";
    if (isNaN(parseInt(mode))) mode = "0";
    let page = await question("Page: ") || "0";
    if (isNaN(parseInt(page))) page = "0";

    levelID = levelID.trim();
    mode = mode.trim();
    page = page.trim();

    const res = await network.makeRequest('getGJComments21.php', { levelID, page, mode, secret: network.SECRETS.common }, DEBUG);
    const parsed = utils.parseComments(res);

    console.log(`\n\x1b[1;34m[Comments for ${levelID}]\x1b[0m\n`);
    if (parsed.length === 0) console.log("\x1b[31mNo results.\x1b[0m");

    parsed.forEach(c => {
        const id = `\x1b[90m#${c.commentID.padEnd(9)}\x1b[0m`;
        const user = `\x1b[1;36m${c.userName.padEnd(16)}\x1b[0m`;
        const p = (c.percentage && c.percentage !== "0") ? `\x1b[32m(${c.percentage}%)\x1b[0m`.padEnd(14) : "".padEnd(6);
        console.log(`${id} ${user} ${p} : ${c.content}`);
    });
    await question("\n[Press Enter]");
}

async function postLevelComment(user) {
    scene("Post Comment");
    
    // 1. Get and validate Level ID
    let levelID = await question("Level ID (type 'cancel' to leave): ");
    if (levelID == "cancel") {
        const savedData = auth.loadAuth();
        return mainMenu(savedData);
    }
    if (!levelID.trim() || isNaN(parseInt(levelID))) {
        console.log("\x1b[31mLevel ID must be a valid number.\x1b[0m");
        await question("[Press Enter]");
        return postLevelComment(user);
    }
    
    // 2. Get and validate Comment Content
    let content = await question("Comment: ");
    if (!content.trim()) {
        console.log("\x1b[31mComment cannot be blank.\x1b[0m");
        await question("[Press Enter]");
        return postLevelComment(user);
    }
    
    // 3. Get and validate Percentage
    let pInput = await question("Percentage: ") || "0";
    const percent = parseInt(pInput.replace(/\D/g, '')) || 0;
    
    levelID = levelID.trim();
    content = content.trim();
    const b64 = utils.base64Encode(content); //

    // 4. Send the request to the Geometry Dash servers
    const res = await network.makeRequest('uploadGJComment21.php', {
        accountID: user.accountID, 
        gjp2: user.gjp2, 
        userName: user.username,
        comment: b64, 
        levelID, 
        percent,
        chk: utils.generateCHK([user.username, b64, levelID, percent]), //
        secret: network.SECRETS.common, //
        gameVersion: "22", 
        binaryVersion: "47"
    }, DEBUG);

    // 5. Response handling with reason tag support
    if (res === "-10") {
        console.log(`\n\x1b[31mPerma-banned by RobTop from comments. Contact support with ID 74 for more info.\x1b[0m`);
    } 
    else if (res.startsWith("temp_")) {
        // Splits "temp_3600_Reason" into ["temp", "3600", "Reason"]
        const parts = res.split("_");
        const time = parts[1];
        const reason = parts[2] || "No reason provided"; 
        
        console.log(`\n\x1b[31mBanned for ${formatBanTime(time)}.\x1b[0m`);
        console.log(`\x1b[31mReason: ${reason}\x1b[0m`);
    } 
    else if (res === "-1") {
        console.log("\n\x1b[31mFailed: Request rejected by server.\x1b[0m");
    } 
    else {
        console.log(`\n\x1b[32mPosted! ID: ${res}\x1b[0m`);
    }

    await new Promise(r => setTimeout(r, 1200));
}

async function deleteLevelComment(user) {
    scene("Delete Level Comment");
    let levelID = await question("Level ID (type 'cancel' to leave): ");
    if (levelID == "cancel") {
        const savedData = auth.loadAuth();
        return mainMenu(savedData);
    }
    if (!levelID.trim() || isNaN(parseInt(levelID))) {
        console.log("\x1b[31mLevel ID must be a valid number.\x1b[0m");
        await question("[Press Enter]");
        return deleteLevelComment(user);
    }
    let commentID = await question("Comment ID: ");
    if (!commentID.trim() || isNaN(parseInt(commentID))) {
        console.log("\x1b[31mComment ID must be a valid number.\x1b[0m");
        await question("[Press Enter]");
        return deleteLevelComment(user);
    }
    levelID = levelID.trim();
    commentID = commentID.trim();
    const res = await network.makeRequest('deleteGJComment20.php', {
        accountID: user.accountID, gjp2: user.gjp2, commentID, levelID, secret: network.SECRETS.common
    }, DEBUG);
    console.log(res === "1" ? "\x1b[32mDeleted.\x1b[0m" : "\x1b[31mError.\x1b[0m");
    await new Promise(r => setTimeout(r, 1200));
}

/** ---------------- ACCOUNT COMMENTS ---------------- **/

async function viewAccountComments(user) {
    scene("Account Comments");
    let targetID = await question(`Acc ID (${user.accountID}) (type 'cancel' to leave): `) || user.accountID;
    if (targetID == "cancel") {
        const savedData = auth.loadAuth();
        return mainMenu(savedData);
    }
    if (isNaN(parseInt(targetID))) {
        console.log("\x1b[31mAccount ID must be a valid number.\x1b[0m");
        await question("[Press Enter]");
        return viewAccountComments(user);
    }
    targetID = targetID.trim();
    const res = await network.makeRequest('getGJAccountComments20.php', {
        accountID: targetID, page: 0, secret: network.SECRETS.common, gameVersion: "22"
    }, DEBUG);
    const parsed = utils.parseComments(res);
    console.log(`\n\x1b[1;34m[Account ${targetID}]\x1b[0m\n`);
    parsed.forEach(c => console.log(`\x1b[90m#${c.commentID}\x1b[0m [\x1b[33m${c.date}\x1b[0m] : ${c.content}`));
    await question("\n[Enter]");
}

async function postAccountComment(user) {
    scene("Post Status");
    let msg = await question("Message (type 'cancel' to leave): ");
    if (msg == "cancel") {
        const savedData = auth.loadAuth();
        return mainMenu(savedData);
    }
    if (!msg.trim()) {
        console.log("\x1b[31mMessage cannot be blank.\x1b[0m");
        await question("[Press Enter]");
        return postAccountComment(user);
    }
    msg = msg.trim();
    const res = await network.makeRequest('uploadGJAccComment20.php', {
        accountID: user.accountID, gjp2: user.gjp2,
        comment: utils.base64Encode(msg), secret: network.SECRETS.common, gameVersion: "22"
    }, DEBUG);
    console.log(res !== "-1" ? "\x1b[32mStatus Updated!\x1b[0m" : "\x1b[31mError.\x1b[0m");
    await new Promise(r => setTimeout(r, 1200));
}

async function deleteAccountComment(user) {
    scene("Delete Account Comment");
    let commentID = await question("Comment ID (type 'cancel' to leave): ");
    if (commentID == "cancel") {
        const savedData = auth.loadAuth();
        return mainMenu(savedData);
    }
    if (!commentID.trim() || isNaN(parseInt(commentID))) {
        console.log("\x1b[31mComment ID must be a valid number.\x1b[0m");
        await question("[Press Enter]");
        return deleteAccountComment(user);
    }
    commentID = commentID.trim();
    const res = await network.makeRequest('deleteGJAccComment20.php', {
        accountID: user.accountID, gjp2: user.gjp2, commentID, secret: network.SECRETS.common
    }, DEBUG);
    console.log(res === "1" ? "\x1b[32mRemoved.\x1b[0m" : "\x1b[31mFailed.\x1b[0m");
    await new Promise(r => setTimeout(r, 1200));

}

async function logout(){
    try{
        await fs.unlink("./auth.dat");
        process.exit();
    }
    catch (err) {
        const savedData = auth.loadAuth();
        console.log("Error deleting data: ", err.message);
        await question("[Press Enter]");
        return mainMenu(savedData);
    }
}

/** ---------------- MAIN MENU ---------------- **/

function mainMenu(user) {
    if (!user) return startFlow();
    process.title = `GDasher | ${user.username}`;
    scene(`Welcome, ${user.username} - v${VERSION}`);

    console.log(` \x1b[1;36m[1]\x1b[0m View Level Comments     \x1b[1;36m[4]\x1b[0m View Account Comments`);
    console.log(` \x1b[1;36m[2]\x1b[0m Post Level Comment      \x1b[1;36m[5]\x1b[0m Post Account Comment`);
    console.log(` \x1b[1;36m[3]\x1b[0m Delete Level Comment    \x1b[1;36m[6]\x1b[0m Delete Account Comment`);
    console.log(` \x1b[1;31m[7]\x1b[0m Logout & Exit           \x1b[1;31m[8]\x1b[0m Exit\n`);

    rl.question("\x1b[1;35mGDASHER > \x1b[0m", async (choice) => {
        if (choice === '1') await viewLevelComments();
        else if (choice === '2') await postLevelComment(user);
        else if (choice === '3') await deleteLevelComment(user);
        else if (choice === '4') await viewAccountComments(user);
        else if (choice === '5') await postAccountComment(user);
        else if (choice === '6') await deleteAccountComment(user);
        else if (choice === '7') await logout();
        else if (choice === '8') process.exit();
        mainMenu(user);
    });
}

/** ---------------- START ---------------- **/
const saved = auth.loadAuth();
if (saved) mainMenu(saved);
else startFlow();
