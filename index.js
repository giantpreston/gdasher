const fs = require("fs").promises;
const readline = require('readline');
const auth = require('./auth');
const network = require('./network');
const utils = require('./utils');

const VERSION = "0.1.1-beta";
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
                if (!wasResumed && !stdin.readableFlowing) stdin.pause();
            } catch (e) {}
        };

        const redisplay = () => {
            stdout.clearLine(0);
            stdout.cursorTo(0);
            stdout.write(`\x1b[1;37m${query}\x1b[0m${"*".repeat(input.length)}`);
        };

        const onData = (chunk) => {
            for (let i = 0; i < chunk.length; i++) {
                const byte = chunk[i];
                if (byte === 0x0A || byte === 0x0D || byte === 0x04) {
                    stdin.removeListener("data", onData);
                    cleanup();
                    stdout.write("\n");
                    resolve(input);
                    return;
                } else if (byte === 0x03) {
                    stdin.removeListener("data", onData);
                    cleanup();
                    reject(new Error("Input cancelled"));
                    return;
                } else if (byte === 0x7F || byte === 0x08) {
                    if (input.length > 0) {
                        input = input.slice(0, -1);
                        redisplay();
                    }
                } else if (byte >= 0x20 && byte < 0x7F) {
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
    if (DEBUG !== true) console.clear();
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

    let userName = (await question("Username (type 'cancel' to leave): ")).trim();
    if (userName.toLowerCase() === "cancel") return startFlow();
    
    let password = (await hiddenQuestion("Password: ")).trim();
    let email = (await question("Email: ")).trim();

    if (!userName || !password || !email) {
        console.log("\x1b[31mFields cannot be blank.\x1b[0m");
        await question("[Press Enter]");
        return registerFlow();
    }

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

    let userName = (await question("Username (type 'cancel' to leave): ")).trim();
    if (userName.toLowerCase() === "cancel") return startFlow();

    let password = (await hiddenQuestion("Password: ")).trim();
    if (!userName || !password) {
        console.log("\x1b[31mFields cannot be blank.\x1b[0m");
        await question("[Press Enter]");
        return loginFlow();
    }

    const gjp2 = auth.generateGJP2(password);
    const response = await network.makeRequest('accounts/loginGJAccount.php', {
        userName, gjp2, udid: utils.generateUDID(), secret: network.SECRETS.account
    }, DEBUG);

    if (response && response.includes(',') && response !== "-1") {
        const [accountID, playerID] = response.split(',');
        const userData = { username: userName, gjp2, accountID, playerID };
        auth.saveAuth(userData);
        console.log("\x1b[32m\nLogin successful!\x1b[0m");
        await new Promise(r => setTimeout(r, 1000));
        mainMenu(userData);
    } else {
        console.log(`\x1b[31m\nLogin Failed (${response === "-1" ? "Invalid Credentials" : response})\x1b[0m`);
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
    let levelID = (await question("Level ID (type 'cancel' to leave): ")).trim();
    if (levelID.toLowerCase() === "cancel") return;

    if (!levelID || isNaN(parseInt(levelID))) {
        console.log("\x1b[31mLevel ID must be a valid number.\x1b[0m");
        await question("[Press Enter]");
        return viewLevelComments();
    }

    let mode = (await question("Mode (0:Recent, 1:Liked): ") || "0").trim();
    let page = (await question("Page: ") || "0").trim();

    const res = await network.makeRequest('getGJComments21.php', { levelID, page, mode, secret: network.SECRETS.common }, DEBUG);
    
    if (!res || res === "-1") {
        console.log("\x1b[31mFailed.\x1b[0m");
        await question("[Press Enter]");
        return;
    }

    const parsed = utils.parseComments(res);
    if (!parsed || parsed.content.length === 0) { console.log("\x1b[31mNo comments.\x1b[0m"); await question("[Press Enter]"); return; }
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
    
    let levelID = (await question("Level ID (type 'cancel' to leave): ")).trim();
    if (levelID.toLowerCase() === "cancel") return;
    
    if (!levelID || isNaN(parseInt(levelID))) {
        console.log("\x1b[31mLevel ID must be a valid number.\x1b[0m");
        await question("[Press Enter]");
        return postLevelComment(user);
    }
    
    let content = (await question("Comment: ")).trim();
    if (!content) {
        console.log("\x1b[31mComment cannot be blank.\x1b[0m");
        await question("[Press Enter]");
        return postLevelComment(user);
    }
    
    let pInput = await question("Percentage: ") || "0";
    const percent = parseInt(pInput.replace(/\D/g, '')) || 0;
    const b64 = utils.base64Encode(content);

    const res = await network.makeRequest('uploadGJComment21.php', {
        accountID: user.accountID, 
        gjp2: user.gjp2, 
        userName: user.username,
        comment: b64, 
        levelID, 
        percent,
        chk: utils.generateCHK([user.username, b64, levelID, percent]),
        secret: network.SECRETS.common,
        gameVersion: "22", 
        binaryVersion: "47"
    }, DEBUG);

    if (res === "-10") {
        console.log(`\n\x1b[31mPerma-banned by RobTop from comments.\x1b[0m`);
    } 
    else if (res && res.startsWith("temp_")) {
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
    let levelID = (await question("Level ID (type 'cancel' to leave): ")).trim();
    if (levelID.toLowerCase() === "cancel") return;

    let commentID = (await question("Comment ID: ")).trim();
    if (isNaN(parseInt(levelID)) || isNaN(parseInt(commentID))) {
        console.log("\x1b[31mIDs must be valid numbers.\x1b[0m");
        await question("[Press Enter]");
        return deleteLevelComment(user);
    }

    const res = await network.makeRequest('deleteGJComment20.php', {
        accountID: user.accountID, gjp2: user.gjp2, commentID, levelID, secret: network.SECRETS.common
    }, DEBUG);
    console.log(res === "1" ? "\x1b[32mDeleted.\x1b[0m" : "\x1b[31mError deleting comment.\x1b[0m");
    await new Promise(r => setTimeout(r, 1200));
}

/** ---------------- ACCOUNT COMMENTS ---------------- **/

async function viewAccountComments(user) {
    scene("Account Comments");
    let targetID = (await question(`Acc ID (${user.accountID}) (type 'cancel' to leave): `) || user.accountID).trim();
    if (targetID.toLowerCase() === "cancel") return;

    if (isNaN(parseInt(targetID))) {
        console.log("\x1b[31mAccount ID must be a valid number.\x1b[0m");
        await question("[Press Enter]");
        return viewAccountComments(user);
    }

    let page = (await question("Page (0): ") || "0").trim();

    const res = await network.makeRequest('getGJAccountComments20.php', {
        accountID: targetID, page: page, secret: network.SECRETS.common, gameVersion: "22"
    }, DEBUG);

    if (!res || res === "-1") {
        console.log("\x1b[31mFailed.\x1b[0m");
        await question("[Press Enter]");
        return;
    }

    const parsed = utils.parseComments(res);
    if (!parsed || parsed.content.length === 0) { console.log("\x1b[31mNo comments.\x1b[0m"); await question("[Press Enter]"); return; }
    console.log(`\n\x1b[1;34m[Account ${targetID}]\x1b[0m\n`);
    parsed.forEach(c => console.log(`\x1b[90m#${c.commentID}\x1b[0m [\x1b[33m${c.date} ago\x1b[0m] : ${c.content}`));
    await question("\n[Enter]");
}

async function postAccountComment(user) {
    scene("Post Status");
    let msg = (await question("Message (type 'cancel' to leave): ")).trim();
    if (msg.toLowerCase() === "cancel") return;

    if (!msg) {
        console.log("\x1b[31mMessage cannot be blank.\x1b[0m");
        await question("[Press Enter]");
        return postAccountComment(user);
    }

    const res = await network.makeRequest('uploadGJAccComment20.php', {
        accountID: user.accountID, gjp2: user.gjp2,
        comment: utils.base64Encode(msg), secret: network.SECRETS.common, gameVersion: "22"
    }, DEBUG);
    console.log(res !== "-1" ? "\x1b[32mStatus Updated!\x1b[0m" : "\x1b[31mError posting status.\x1b[0m");
    await new Promise(r => setTimeout(r, 1200));
}

async function deleteAccountComment(user) {
    scene("Delete Account Comment");
    let commentID = (await question("Comment ID (type 'cancel' to leave): ")).trim();
    if (commentID.toLowerCase() === "cancel") return;

    if (!commentID || isNaN(parseInt(commentID))) {
        console.log("\x1b[31mComment ID must be a valid number.\x1b[0m");
        await question("[Press Enter]");
        return deleteAccountComment(user);
    }

    const res = await network.makeRequest('deleteGJAccComment20.php', {
        accountID: user.accountID, gjp2: user.gjp2, commentID, secret: network.SECRETS.common
    }, DEBUG);
    console.log(res === "1" ? "\x1b[32mRemoved.\x1b[0m" : "\x1b[31mFailed to delete.\x1b[0m");
    await new Promise(r => setTimeout(r, 1200));
}

/** ---------------- SOCIAL ---------------- **/

async function readFriendRequests(user) {
    scene("Friend Requests");
    let choice = (await question("(0) Received or (1) Sent Requests (type 'cancel' to leave): ")).trim();
    if (choice.toLowerCase() === "cancel") return;

    if (!["0", "1"].includes(choice)) {
        console.log("\x1b[31mInvalid selection.\x1b[0m");
        await question("[Press Enter]");
        return readFriendRequests(user);
    }

    const res = await network.makeRequest('getGJFriendRequests20.php', {
        accountID: user.accountID, gjp2: user.gjp2, secret: network.SECRETS.common, getSent: choice
    }, DEBUG)
    
    if (res === "-2") {
        console.log("\x1b[31mNo friend requests found.\x1b[0m");
        await question("[Press Enter]");
        return;
    }
    if (res == "-1") {
        console.log("\x1b[31mFailed.\x1b[0m");
        await question("[Press Enter]");
        return;
    }

    const parsed = utils.parseFriendRequests(res);
    const modeString = choice === "0" ? "Received Requests" : "Sent Requests";

    console.log(`\n\x1b[1;34m[${modeString}]\x1b[0m\n`);

    parsed.forEach(f => {
        const id = `\x1b[90m#${f.accountID.padEnd(9)}\x1b[0m`;
        const u = `\x1b[1;36m${f.userName.padEnd(16)}\x1b[0m`;
        const n = (f.isNew && choice === "0") ? `\x1b[32m(NEW!)\x1b[0m`.padEnd(14) : "".padEnd(6);
        const ageText = `${f.age} ago`;
        if (!f.message || f.message === "") {
            console.log(`${id} ${u} ${ageText} ${n}`);
        } else {
            console.log(`${id} ${u} ${ageText} ${n} : ${f.message}`);
        }
    });

    if (choice === "0") {
        let action = (await question("\nDo you want to (A)ccept, (R)eject, or (L)eave: ")).trim().toUpperCase();
        if (action === "L") return;
        if (action === "A") {
            let target = await question("Enter Account ID: ");
            const res2 = await network.makeRequest('acceptGJFriendRequest20.php', {
                accountID: user.accountID, targetAccountID: target, gjp2: user.gjp2, secret: network.SECRETS.common
            }, DEBUG);
            console.log(res2 !== "-1" ? "\x1b[32mAccepted!\x1b[0m" : "\x1b[31mFailed.\x1b[0m");
        } 
        else if (action === "R") {
            let target = await question("Enter Account ID: ");
            const res2 = await network.makeRequest('deleteGJFriendRequests20.php', {
                accountID: user.accountID, targetAccountID: target, gjp2: user.gjp2, secret: network.SECRETS.common
            }, DEBUG);
            console.log(res2 !== "-1" ? "\x1b[32mRejected!\x1b[0m" : "\x1b[31mFailed.\x1b[0m");
        }
    } else {
        let action = (await question("\nDo you want to (D)elete or (L)eave: ")).trim().toUpperCase();
        if (action === "D") {
            let target = await question("Enter Account ID: ");
            const res2 = await network.makeRequest('deleteGJFriendRequests20.php', {
                accountID: user.accountID, targetAccountID: target, gjp2: user.gjp2, secret: network.SECRETS.common, isSender: 1
            }, DEBUG);
            console.log(res2 !== "-1" ? "\x1b[32mDeleted!\x1b[0m" : "\x1b[31mFailed.\x1b[0m");
        }
    }
    await new Promise(r => setTimeout(r, 1200));
}

async function sendFriendRequest(user) {
    scene("Send Friend Request");
    let userName = (await question("Username (type 'cancel' to leave): ")).trim();
    if (userName.toLowerCase() === "cancel") return;

    if (!userName) {
        console.log("\x1b[31mPlease insert a valid username.\x1b[0m");
        await question("[Press Enter]");
        return sendFriendRequest(user);
    }

    let comment = await question("Comment w/ friend req (leave blank for no msg): ");
    const res = await network.makeRequest('getGJUsers20.php', {
        secret: network.SECRETS.common, str: userName
    }, DEBUG);

    if (!res || res === "-1") {
        console.log("\x1b[31mUsername not found or server refused request.\x1b[0m");
        await question("[Press Enter]");
    } else {
        const parsedUser = utils.parseUser(res);
        if(!parsedUser || !parsedUser.accountID) {
            console.log("\x1b[31mFailed to parse user data.\x1b[0m");
            await question("[Press Enter]");
            return;
        }
        const targetAccountId = parsedUser.accountID;
        const res2 = await network.makeRequest('uploadFriendRequest20.php', {
            accountID: user.accountID, toAccountID: targetAccountId, gjp2: user.gjp2, secret: network.SECRETS.common, comment: utils.base64Encode(comment)
        }, DEBUG);
        console.log(res2 === "1" ? "\x1b[32mSent.\x1b[0m" : "\x1b[31mFailed. User may have requests disabled.\x1b[0m");
        await new Promise(r => setTimeout(r, 1200));
    }
}

async function checkUsers(user) {
    scene("User List");
    const selection = (await question("(0) Friends or (1) Blocked (type 'cancel' to leave): ")).trim();
    if (selection.toLowerCase() == "cancel") {
        return mainMenu(user);
    }
    if (selection > 1 || !selection.trim() || isNaN(selection)) {
        console.log("\x1b[31mInvalid selection.\x1b[0m");
        return checkUsers(user);
    }
    const res = await network.makeRequest('getGJUserList20.php', {
        accountID: user.accountID, gjp2: user.gjp2, secret: network.SECRETS.common, type: selection
    }, DEBUG);

    if (res == "-2") { console.log("\x1b[31mNothing found (empty!).\x1b[0m"); await question("[Press Enter]"); return; };
    if (res == "-1") { console.log("\x1b[31mFailed.\x1b[0m"); await question("[Press Enter]"); return; };
    const parsed = utils.parseUserSearch(res);
    const modeString = selection === "0" ? "Friends List" : "Blocked Users";
    console.log(`\n\x1b[1;34m[${modeString}]\x1b[0m\n`);

    parsed.forEach(u => {
        const id = `\x1b[90m#${u.accountID.padEnd(9)}\x1b[0m`;
        const user = `\x1b[1;36m${u.username.padEnd(16)}\x1b[0m`;
        console.log(`${id} ${user}`);
    });
    
    if (selection == "0") {
        const choice = (await question("Do you want to (U)nfriend or (L)eave: ")).trim().toUpperCase();

        if (!choice || !["U", "L"].includes(choice)) { console.log("\x1b[31mInvalid choice!"); await question("[Press Enter]"); return checkUsers(user); }
        if (choice == "U") {
            const targetAccountId = (await question("Enter Account ID: ")).trim();
            if (!targetAccountId || isNaN(targetAccountId)) { console.log("\x1b[31mInvalid ID!"); await question("[Press Enter]"); return checkUsers(user); };

            const res2 = await network.makeRequest('removeGJFriend20.php', {
                accountID: user.accountID, gjp2: user.gjp2, targetAccountID: targetAccountId, secret: network.SECRETS.common
            }, DEBUG);
            console.log(res2 !== "-1" ? "\x1b[32mUnfriended!\x1b[0m" : "\x1b[31mFailed.\x1b[0m");
        } else { return; }
    } else {
        const choice = (await question("Do you want to (U)nblock or (L)eave")).trim().toUpperCase();

        if (!choice || !["U", "L"].includes(choice)) { console.log("\x1b[31mInvalid choice!"); await question("[Press Enter]"); return checkUsers(user); }
        if (choice == "U") {
            const targetAccountId = (await question("Enter Account ID: ")).trim();
            if (!targetAccountId || isNaN(targetAccountId)) { console.log("\x1b[31mInvalid ID!"); await question("[Press Enter]"); return checkUsers(user); };

            const res2 = await network.makeRequest('unblockGJUser20.php', {
                accountID: user.accountID, gjp2: user.gjp2, targetAccountID: targetAccountId, secret: network.SECRETS.common
            }, DEBUG);
            console.log(res2 !== "-1" ? "\x1b[32mUnblocked!\x1b[0m" : "\x1b[31mFailed.\x1b[0m");
        }
    }
    await new Promise(r => setTimeout(r, 1200));
}

/** ---------------- LEVELS ---------------- **/

async function checkDaily(user) {
    scene("Daily/Weekly Lookup");
    
    let mode = (await question("(D)aily or (W)eekly level: ")).trim().toUpperCase();
    if (!['D', 'W'].includes(mode)) {
        console.log("\x1b[31mInvalid selection.\x1b[0m");
        await question("[Press Enter]");
        return;
    }

    const isWeekly = mode === 'W';
    const type = isWeekly ? 22 : 21;
    const label = isWeekly ? "Weekly" : "Daily";

    const dailyInfo = await network.makeRequest('getGJDailyLevel.php', {
        secret: network.SECRETS.common,
        weekly: isWeekly ? 1 : 0
    }, DEBUG);

    if (!dailyInfo || dailyInfo === "-1") {
        console.log(`\x1b[31mFailed to fetch ${label} info.\x1b[0m`);
        await question("[Press Enter]");
        return;
    }

    const [dailyNum, timeLeft] = dailyInfo.split('|');
    if (!dailyNum || !timeLeft) {
        console.log("\x1b[31mInvalid response from server.\x1b[0m");
        await question("[Press Enter]");
        return;
    }

    const searchID = isWeekly ? parseInt(dailyNum) - 100000 : dailyNum;

    const levelRes = await network.makeRequest('getGJLevels21.php', {
        secret: network.SECRETS.common,
        type: type,
        str: searchID
    }, DEBUG);

    if (!levelRes || levelRes === "-1") {
        console.log(`\x1b[31mCould not find ${label} level details.\x1b[0m`);
        await question("[Press Enter]");
        return;
    }

    const parsedLevels = utils.parseLevelSearch(levelRes);
    const level = parsedLevels[0];

    if (!level) {
        console.log("\x1b[31mError parsing level data.\x1b[0m");
        await question("[Press Enter]");
        return;
    }

    console.log(`\n\x1b[1;32mThe ${label} level is ${level.name}, ID ${level.id}. It awards you ${level.stats.stars} stars. The ${label} level changes in ${formatBanTime(timeLeft)}\x1b[0m`);
    
    await question("\n[Press Enter]");
}

/** ---------------- LOGOUT HELPER ---------------- **/

async function logout() {
    try {
        await fs.unlink("./auth.dat");
        process.exit();
    } catch (err) {
        console.log("Error deleting data: ", err.message);
        await question("[Press Enter]");
    }
}

/** ---------------- MAIN MENU ---------------- **/

async function mainMenu(user) {
    if (!user) return startFlow();
    
    while (true) {
        process.title = `GDasher | ${user.username}`;
        scene(`Welcome, ${user.username} - v${VERSION}`);

        console.log(` \x1b[1;36m[1]\x1b[0m View Level Comments     \x1b[1;36m[4]\x1b[0m View Account Comments`);
        console.log(` \x1b[1;36m[2]\x1b[0m Post Level Comment      \x1b[1;36m[5]\x1b[0m Post Account Comment`);
        console.log(` \x1b[1;36m[3]\x1b[0m Delete Level Comment    \x1b[1;36m[6]\x1b[0m Delete Account Comment`);
        console.log(` \x1b[1;36m[7]\x1b[0m Read Friend Requests    \x1b[1;36m[8]\x1b[0m Send a Friend Request`);
        console.log(` \x1b[1;36m[9]\x1b[0m Read Personal User List \x1b[1;36m[10]\x1b[0m Check daily/weekly`)
        console.log(` \x1b[1;31m[11]\x1b[0m Logout & Exit          \x1b[1;31m[12]\x1b[0m Exit\n`);

        const choice = await question("\x1b[1;35mGDASHER > \x1b[0m");

        if (choice === '1') await viewLevelComments();
        else if (choice === '2') await postLevelComment(user);
        else if (choice === '3') await deleteLevelComment(user);
        else if (choice === '4') await viewAccountComments(user);
        else if (choice === '5') await postAccountComment(user);
        else if (choice === '6') await deleteAccountComment(user);
        else if (choice === '7') await readFriendRequests(user);
        else if (choice === '8') await sendFriendRequest(user);
        else if (choice === '9') await checkUsers(user);
        else if (choice === '10') await checkDaily(user);
        else if (choice === '11') { await logout(); break; }
        else if (choice === '12') process.exit();
    }
}

/** ---------------- START ---------------- **/
(async () => {
    const saved = await auth.loadAuth();
    if (saved) await mainMenu(saved);
    else await startFlow();
})();