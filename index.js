const fs = require("fs").promises;
const readline = require('readline');
const auth = require('./auth');
const network = require('./network');
const utils = require('./utils');
const enums = require('./enums');

const VERSION = "0.1.8";
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
            } catch (e) { }
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
    // Version check on every scene
    (async () => {
        const res = await utils.getVersion();
        if (res === VERSION) return;
        console.log(`\x1b[31mYour version of GDasher is out of date! (v${VERSION}), latest is ${res}. Update to the latest version on the GitHub!`);
    })();
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
    if (!parsed || parsed.length === 0) { console.log("\x1b[31mNo comments.\x1b[0m"); await question("[Press Enter]"); return; }
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
    if (!parsed || parsed.length === 0) { console.log("\x1b[31mNo comments.\x1b[0m"); await question("[Press Enter]"); return; }
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
        accountID: user.accountID, gjp2: user.gjp2, commentID, targetAccountID: user.accountID, secret: network.SECRETS.common
    }, DEBUG);
    console.log(res === "1" ? "\x1b[32mRemoved.\x1b[0m" : "\x1b[31mFailed to delete.\x1b[0m");
    await new Promise(r => setTimeout(r, 1200));
}

/** ---------------- SOCIAL ---------------- **/

async function readFriendRequests(user) {
    scene("Friend Requests");
    let choice = (await question("(0) Received or (1) Sent Requests (type 'cancel' to leave): ")).trim();
    let page = (await question("Page (0): ")).trim();
    if (!page || page == null) page = 0;
    if (choice.toLowerCase() === "cancel") return;

    if (isNaN(page)) { console.log("\x1b[31mInvalid page.\x1b[0m"); await question("[Press Enter]"); return readFriendRequests(user); }
    if (!["0", "1"].includes(choice)) {
        console.log("\x1b[31mInvalid selection.\x1b[0m");
        await question("[Press Enter]");
        return readFriendRequests(user);
    }

    const res = await network.makeRequest('getGJFriendRequests20.php', {
        accountID: user.accountID, gjp2: user.gjp2, secret: network.SECRETS.common, page: page, getSent: choice
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
        if (!parsedUser || !parsedUser.accountID) {
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

async function readMessages(user) {
    scene("Messages");

    const selection = (await question("(0) Received Messages or (1) Sent Messages (type 'cancel' to leave): ")).trim();
    let page = (await question("Page (0): ")).trim();
    if (!page || page == null) page = 0;
    if (selection.toLowerCase() == "cancel") return;

    if (isNaN(selection) || !selection || selection > 1) { console.log("\x1b[31mInvalid ID!"); await question("[Press Enter]"); return readMessages(user); }
    if (isNaN(page)) { console.log("\x1b[31mInvalid page.\x1b[0m"); await question("[Press Enter]"); return readMessages(user); }

    const res = await network.makeRequest('getGJMessages20.php', {
        accountID: user.accountID, gjp2: user.gjp2, secret: network.SECRETS.common, page: page, getSent: selection
    }, DEBUG)
    const parsed = utils.parseMessages(res);
    if (res == "-1") { console.log("\x1b[31mFailed.\x1b[0m"); await question("[Press Enter]"); return; };
    if (res == "-2") { console.log("\x1b[31mNo messages.\x1b[0m"); await question("[Press Enter]"); return; };

    const modeString = selection === "0" ? "Received Messages" : "Sent Messages";
    console.log(`\n\x1b[1;34m[${modeString}]\x1b[0m\n`);

    parsed.forEach(m => {
        const id = `\x1b[90m#${m.accountID.padEnd(9)}\x1b[0m`;
        const u = `\x1b[1;36m${m.userName.padEnd(16)}\x1b[0m`;
        const n = (!m.isRead && selection === "0") ? `\x1b[32m(NEW!)\x1b[0m`.padEnd(14) : "".padEnd(6);
        const ageText = `${m.age} ago`;
        console.log(`${id} ${u} ${ageText} ${n} : ${m.subject} \x1b[90m(Message ID: #${m.messageID})\x1b[0m`);
    });

    const choice = (await question("(R)ead Full Content or (L)eave: ")).trim().toUpperCase();
    if (!['R', 'L'].includes(choice)) { console.log("\x1b[31mInvalid selection.\x1b[0m"); await question("[Press Enter]"); return; }

    if (choice == "R") {
        const messageId = (await question("Message ID: ")).trim();
        if (isNaN(messageId) || !messageId) { console.log("\x1b[31mInvalid Message ID.\x1b[0m"); await question("[Press Enter]"); return; }
        if (selection == 0) {
            const res2 = await network.makeRequest('downloadGJMessage20.php', {
                accountID: user.accountID, gjp2: user.gjp2, messageID: messageId, secret: network.SECRETS.common
            }, DEBUG)
            if (res2 == "-1") { console.log("\x1b[31mFailed.\x1b[0m"); await question("[Press Enter]"); return; };

            const parsed2 = utils.parseMessages(res2);
            parsed2.forEach(m2 => {
                const divider = "\x1b[90m" + "─".repeat(50) + "\x1b[0m";
                const id = `\x1b[90mID: #${m2.accountID}\x1b[0m`;
                const usr = `\x1b[1;36m${m2.userName}\x1b[0m`;
                const subject = `\x1b[1;37mSubject: ${m2.subject}\x1b[0m`;

                console.log(`\n${divider}`);
                console.log(`${usr} ${' '.repeat(Math.max(2, 30 - m2.userName.length))} ${id}`);
                console.log(`${subject}`);
                console.log(`${divider}`);
                console.log(`\n${m2.body}`);
                console.log(`\n${divider}\n`);
            });
            await question("[Press Enter]");
        } else {
            const res2 = await network.makeRequest('downloadGJMessage20.php', {
                accountID: user.accountID, gjp2: user.gjp2, messageID: messageId, secret: network.SECRETS.common, isSender: 1
            }, DEBUG)
            if (res2 == "-1") { console.log("\x1b[31mFailed.\x1b[0m"); await question("[Press Enter]"); return; };

            const parsed2 = utils.parseMessages(res2);
            parsed2.forEach(m2 => {
                const divider = "\x1b[90m" + "─".repeat(50) + "\x1b[0m";
                const id = `\x1b[90mID: #${m2.accountID}\x1b[0m`;
                const usr = `\x1b[1;36m${m2.userName}\x1b[0m`;
                const subject = `\x1b[1;37mSubject: ${m2.subject}\x1b[0m`;

                console.log(`\n${divider}`);
                console.log(`${usr} ${' '.repeat(Math.max(2, 30 - m2.userName.length))} ${id}`);
                console.log(`${subject}`);
                console.log(`${divider}`);
                console.log(`\n${m2.body}`);
                console.log(`\n${divider}\n`);
            });
            await question("[Press Enter]");
        }
    }
    if (choice == "L") return;
}

async function sendMessage(user) {
    scene("Send Message");

    const uname = (await question("Enter Username (type 'cancel' to leave): ")).trim();
    if (uname.toLowerCase() == "cancel") return;
    if (!uname) {
        console.log("\x1b[31mInvalid Username!");
        await question("[Press Enter]");
        return readMessages(user);
    }

    const subj = await question("Subject: ");
    const msg = await question("Body: ");
    const key = "14251";
    let xorBody = "";

    for (let i = 0; i < msg.length; i++) {
        xorBody += String.fromCharCode(msg.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }

    const res = await network.makeRequest('getGJUsers20.php', {
        secret: network.SECRETS.common,
        str: uname
    }, DEBUG);

    if (res == "-1") {
        console.log("\x1b[31mUsername not found or server refused request.\x1b[0m");
        await question("[Press Enter]");
        return;
    }

    const parsed = utils.parseUser(res);

    const res2 = await network.makeRequest('uploadGJMessage20.php', {
        accountID: user.accountID,
        gjp2: user.gjp2,
        toAccountID: parsed.accountID,
        subject: utils.base64Encode(subj),
        body: utils.base64Encode(xorBody),
        secret: network.SECRETS.common
    }, DEBUG);

    console.log(res2 !== "-1" ? "\x1b[32mSent!\x1b[0m" : "\x1b[31mFailed. User might have messages off.\x1b[0m");

    await new Promise(r => setTimeout(r, 1200));
}


async function lookupUser(user) {
    scene("User Lookup");
    const userName = (await question("Username (type 'cancel' to leave): ")).trim().toLowerCase();
    if (userName == 'cancel') return;
    if (!userName) { console.log("\x1b[31mInvalid Username!\x1b[0m"); await question("[Press Enter]"); return lookupUser(user); };

    const res1 = await network.makeRequest('getGJUsers20.php', { secret: network.SECRETS.common, str: userName }, DEBUG);
    if (!res1 || res1 === "-1") {
        console.log("\x1b[31mUser not found or server refused request.\x1b[0m");
        await new Promise(r => setTimeout(r, 1500));
        return;
    }
    const parsed1 = utils.parseUser(res1);
    const res = await network.makeRequest('getGJUserInfo20.php', {
        targetAccountID: parsed1.accountID, gameVersion: 22, gameBinary: 47, secret: network.SECRETS.common // apparently if gameversion isnt 22, it wont return 3 for leaderboard moderators. god bless robtop.
    }, DEBUG);

    const parsed = utils.parseUser(res);
    if (!parsed) {
        console.log("\x1b[31mFailed to parse user data.\x1b[0m");
        await new Promise(r => setTimeout(r, 1500));
        return;
    }

    const divider = "\x1b[90m" + "─".repeat(76) + "\x1b[0m";
    console.log(`\n${divider}`);
    console.log(`\x1b[1;36mUsername:\x1b[0m ${parsed.username}`);
    console.log(`\x1b[1;36mAccount ID:\x1b[0m ${parsed.accountID}`);
    console.log(`\x1b[1;36mPlayer ID:\x1b[0m ${parsed.userID || 'N/A'}`);
    if (parseInt(parsed.stars) > 500) {
        console.log(`\x1b[1;36mGlobal Rank:\x1b[0m ${utils.formatNumber(parsed.globalRank) || "N/A"}`);
    }
    const modLabel = parsed.modLevel === 2 ? 'Elder' : parsed.modLevel === 1 ? 'Moderator' : parsed.modLevel === 3 ? 'Leaderboard' : 'None';
    if (parsed.modLevel > 0) console.log(`\x1b[1;36mModerator Level:\x1b[0m ${modLabel}`);
    console.log(`${divider}`);
    const stats = [];
    stats.push(`Stars: ${utils.formatNumber(parsed.stars)}`);
    stats.push(`Demons: ${utils.formatNumber(parsed.demons)}`);
    stats.push(`User Coins: ${utils.formatNumber(parsed.userCoins)}`);
    stats.push(`Secret Coins: ${utils.formatNumber(parsed.secretCoins)}`);
    if (parseInt(parsed.creatorPoints) > 0) stats.push(`Creator Points: ${utils.formatNumber(parsed.creatorPoints)}`);
    console.log(`\x1b[1;33mStats:\x1b[0m   ${stats.join('   ')}`);
    console.log(`\x1b[1;33m                         \x1b[0m   Diamonds: ${utils.formatNumber(parsed.diamonds)}   Moons: ${utils.formatNumber(parsed.moons)}`);
    console.log(`${divider}`);

    const s = parsed.socials || {};
    if (s.youtube || s.twitter || s.twitch || s.discord || s.instagram) {
        let youtubevalue;
        console.log(`\x1b[1;33mSocials:\x1b[0m`);
        if (s.youtube.startsWith("UC") && s.youtube.length === 24) { youtubevalue = `https://youtube.com/channel/${s.youtube}` } else { youtubevalue = `https://youtube.com/@${s.youtube}` }
        if (s.youtube) console.log(`  YouTube: ${youtubevalue}`);
        if (s.twitter) console.log(`  Twitter: https://x.com/${s.twitter}`);
        if (s.twitch) console.log(`  Twitch: https://twitch.tv/${s.twitch}`);
        if (s.discord) console.log(`  Discord: @${s.discord}`);
        if (s.instagram) console.log(`  Instagram: @${s.instagram}`);
        console.log(divider);
    }
    console.log('\x1b[1;33mSocial Settings:\x1b[0m');

    const chs = parsed.commentHistoryState === 0 ? 'Everyone' : parsed.commentHistoryState === 1 ? 'Friends Only' : 'No one';
    const frs = parsed.friendsState === 0 ? 'Everyone' : 'No one';
    const ms = parsed.messageState === 0 ? 'Everyone' : parsed.messageState === 1 ? 'Friends Only' : 'No one';
    console.log(`  Comment History Status: ${chs}`);
    console.log(`  Friend Request Status: ${frs}`);
    console.log(`  Message Status: ${ms}`);

    await question("[Press Enter]");
}

/** ---------------- LEVELS ---------------- **/

async function checkDaily(user) {
    scene("Daily/Weekly Lookup");

    let mode = (await question("(D)aily or (W)eekly level (type 'cancel' to leave): ")).trim().toUpperCase();
    if (mode.toLowerCase() == "cancel") return;

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

    const parsedLevels = await utils.parseLevelSearch(levelRes, async (playerID) => {
        const res = await network.makeRequest('getGJUsers20.php', { str: playerID, secret: network.SECRETS.common }, DEBUG);
        return utils.parseUser(res);
    });
    const level = parsedLevels[0];

    if (!level) {
        console.log("\x1b[31mError parsing level data.\x1b[0m");
        await question("[Press Enter]");
        return;
    }

    console.log(`\n\x1b[1;32mThe ${label} level is ${level.levelName} by ${level.author.username || 'Unknown'}, ID ${level.levelID}. It awards you ${level.rating.stars} stars. The ${label} level changes in ${formatBanTime(timeLeft)}\x1b[0m`);

    await question("\n[Press Enter]");
}

async function levelSearch(user) {
    scene("Level Search");

    // Build filter object
    const filters = {};

    console.log("\x1b[1;33m=== Search Filters (leave blank for default) ===\x1b[0m\n");

    // Search query (for type 0)
    const query = await question("Search query (name or user ID): ");
    if (query && query.toLowerCase() !== "cancel") {
        filters.str = query;
    } else if (query && query.toLowerCase() === "cancel") {
        return;
    }

    // Search type
    if (!query) {
        console.log("\n\x1b[1;36mSearch Types:\x1b[0m");
        console.log("        1 - Most downloaded");
        console.log(" 2 - Most liked        3 - Trending");
        console.log(" 4 - Recent            5 - User's levels");
        console.log(" 6 - Featured          7 - Magic");
        console.log(" 8 - Mod sent          10 - Level list");
        console.log(" 11 - Awarded          12 - Followed");
        console.log(" 13 - Friends          21 - Daily history");
        console.log(" 22 - Weekly history");

        let type = await question("\nType (default 2): ");
        filters.type = (type && type !== "") ? parseInt(type) : 2;
    } else { filters.type = 0 }
    // Difficulty filter
    console.log("\n\x1b[1;36mDifficulty Filters (comma separated):\x1b[0m");
    console.log(" -2 - Demons     1 - Easy     2 - Normal");
    console.log(" 3 - Hard        4 - Harder   5 - Insane");
    const diff = await question("Difficulties (e.g., '1,3,5'): ");
    if (diff && diff !== "") {
        filters.diff = diff;
    } else {
        filters.diff = "-";
    }

    // Demon filter
    if (filters.diff && filters.diff.includes('-2')) {
        console.log("\n\x1b[1;36mDemon Difficulty:\x1b[0m");
        console.log(" 1 - Easy Demon    2 - Medium Demon");
        console.log(" 3 - Hard Demon    4 - Insane Demon");
        console.log(" 5 - Extreme Demon");
        const demonFilter = await question("Demon difficulty: ");
        if (demonFilter && demonFilter !== "") {
            filters.demonFilter = parseInt(demonFilter);
        }
    }

    // Length filter
    console.log("\n\x1b[1;36mLength:\x1b[0m");
    console.log(" 0 - Tiny     1 - Short     2 - Medium");
    console.log(" 3 - Long     4 - XL        5 - Platformer");
    const len = await question("Length (0-5): ");
    if (len && len !== "") {
        filters.len = parseInt(len);
    } else {
        filters.len = "-";
    }

    // Rating filters
    console.log("\n\x1b[1;36mRating Filters:\x1b[0m");
    const star = await question("Only rated (1=yes, 0=no): ");
    if (star && star !== "") {
        filters.star = parseInt(star);
    } else {
        filters.star = 0;
    }

    const noStar = await question("Only unrated (1=yes, 0=no): ");
    if (noStar && noStar !== "") {
        filters.noStar = parseInt(noStar);
    } else {
        filters.noStar = 0;
    }

    const featured = await question("Only featured (1=yes): ");
    if (featured && featured !== "") {
        filters.featured = parseInt(featured);
    } else {
        filters.featured = 0;
    }

    const epic = await question("Only epic (1=yes): ");
    if (epic && epic !== "") {
        filters.epic = parseInt(epic);
    } else {
        filters.epic = 0;
    }

    const original = await question("Only original (1=yes): ");
    if (original && original !== "") {
        filters.original = parseInt(original);
    } else {
        filters.original = 0;
    }

    // Completion filters
    console.log("\n\x1b[1;36mCompletion Filters:\x1b[0m");
    const uncompleted = await question("Only uncompleted (1=yes): ");
    if (uncompleted && uncompleted !== "") {
        filters.uncompleted = parseInt(uncompleted);
    } else {
        filters.uncompleted = 0;
    }

    const onlyCompleted = await question("Only completed (1=yes): ");
    if (onlyCompleted && onlyCompleted !== "") {
        filters.onlyCompleted = parseInt(onlyCompleted);
    } else {
        filters.onlyCompleted = 0;
    }

    // Coin filter
    const coins = await question("Has coins (1=yes): ");
    if (coins && coins !== "") {
        filters.coins = parseInt(coins);
    } else {
        filters.coins = 0;
    }

    // Two player filter
    const twoPlayer = await question("Two player mode (1=yes): ");
    if (twoPlayer && twoPlayer !== "") {
        filters.twoPlayer = parseInt(twoPlayer);
    } else {
        filters.twoPlayer = 0;
    }

    // Page
    let page = await question("\nPage number (default 0): ");
    if (page === "") page = "0";

    // Account ID for friend/followed searches
    if (filters.type === 12 || filters.type === 13) {
        filters.accountID = user.accountID;
        filters.gjp2 = user.gjp2;
        if (filters.type === 12 && user.followed) {
            filters.followed = user.followed;
        }
    }

    // Add required parameters
    filters.secret = network.SECRETS.common;
    filters.gameVersion = "22";
    filters.binaryVersion = "47";
    filters.page = page;
    filters.total = "0";

    // Remove empty filters
    Object.keys(filters).forEach(key => {
        if (filters[key] === undefined || filters[key] === null || filters[key] === "") {
            delete filters[key];
        }
    });

    console.log("\n\x1b[1;33mSearching for levels...\x1b[0m");

    const response = await network.makeRequest('getGJLevels21.php', filters, DEBUG);

    if (!response || response === "-1") {
        console.log("\x1b[31mNo levels found or search failed.\x1b[0m");
        await question("[Press Enter]");
        return;
    }

    // Parse page info
    let totalLevels = 0;
    let currentPage = parseInt(page);
    const [, , , pageInfo] = response.split('#');
    if (pageInfo) {
        const [total] = pageInfo.split(':');
        totalLevels = parseInt(total) || 0;
    }

    // Display results with pagination
    let viewing = true;
    let currentFilters = { ...filters };

    while (viewing) {
        // Fetch levels for current page
        currentFilters.page = currentPage.toString();

        const pageResponse = currentPage === parseInt(page) && response !== "-1"
            ? response
            : await network.makeRequest('getGJLevels21.php', currentFilters, DEBUG);

        if (!pageResponse || pageResponse === "-1") {
            console.log("\x1b[31mNo levels found on this page.\x1b[0m");
            if (currentPage > 0) currentPage--;
            await question("[Press Enter]");
            continue;
        }

        // Parse levels using the existing utils function (resolve creator usernames)
        const parsedLevels = await utils.parseLevelSearch(pageResponse, async (playerID) => {
            const res = await network.makeRequest('getGJUsers20.php', { str: playerID, secret: network.SECRETS.common }, DEBUG);
            return utils.parseUser(res);
        });

        if (parsedLevels.length === 0) {
            console.log("\x1b[31mNo levels found.\x1b[0m");
            await question("[Press Enter]");
            return;
        }

        // Convert parsed levels to display format
        const levels = parsedLevels.map(level => ({
            levelData: level,
            levelID: level.levelID,
            name: level.levelName,
            creator: level.author.username,
            stars: level.rating.stars,
            difficultyIcon: getDifficultyEmoji(level.difficulty),
            epicIcon: getEpicEmoji(level.rating.epicRating),
            likes: level.stats.likes,
            downloads: level.stats.downloads,
            length: level.info.length.name,
            coins: level.coins.total,
            featured: level.rating.featureScore > 0
        }));
        function shortenNumber(num, options = {}) {
            const {
                decimals = 2,
                addSpace = false,
                thousandSuffix = "K",
                millionSuffix = "M",
                billionSuffix = "B",
                trillionSuffix = "T",
                quadrillionSuffix = "Q"
            } = options;

            if (num === undefined || num === null) return "0";

            const absNum = Math.abs(num);
            const sign = num < 0 ? "-" : "";
            const space = addSpace ? " " : "";

            if (absNum >= 1_000_000_000_000_000) {
                return sign + (absNum / 1_000_000_000_000_000).toFixed(decimals) + space + quadrillionSuffix;
            }
            if (absNum >= 1_000_000_000_000) {
                return sign + (absNum / 1_000_000_000_000).toFixed(decimals) + space + trillionSuffix;
            }
            if (absNum >= 1_000_000_000) {
                return sign + (absNum / 1_000_000_000).toFixed(decimals) + space + billionSuffix;
            }
            if (absNum >= 1_000_000) {
                return sign + (absNum / 1_000_000).toFixed(decimals) + space + millionSuffix;
            }
            if (absNum >= 1_000) {
                return sign + (absNum / 1_000).toFixed(decimals) + space + thousandSuffix;
            }

            return sign + absNum.toString();
        }

        scene(`Level Search Results - Page ${currentPage}${totalLevels > 0 ? ` (${levels.length}/${totalLevels} levels)` : ''}`);

        console.log(`\x1b[1;33mFilters:\x1b[0m`);
        if (currentFilters.str) console.log(`  Query: "${currentFilters.str}"`);
        console.log(`  Type: ${currentFilters.type} - ${getSearchTypeName(currentFilters.type)}`);
        console.log("");

        // Display levels in a table format
        console.log("\x1b[1;36m┌─────┬──────────────────────────┬─────────────────┬──────────┬──────────┬────────┐\x1b[0m");
        console.log("\x1b[1;36m│ #   │ Level Name               │ Creator         │ Stars    │ Likes    │ DLs    │\x1b[0m");
        console.log("\x1b[1;36m├─────┼──────────────────────────┼─────────────────┼──────────┼──────────┼────────┤\x1b[0m");

        levels.forEach((level, idx) => {
            const num = (idx + 1).toString().padStart(3);
            let name = level.name.length > 24 ? level.name.substring(0, 21) + "..." : level.name.padEnd(24);
            let creator = level.creator.length > 15 ? level.creator.substring(0, 12) + "..." : level.creator.padEnd(15);
            let stars = `${level.difficultyIcon}${level.epicIcon} ${level.stars > 0 ? level.stars : ""}${level.stars > 0 ? "⭐" : ""}`.padEnd(8);
            let likes = shortenNumber(level.likes).padEnd(8);
            let downloads = shortenNumber(level.downloads).padEnd(6);

            console.log(`\x1b[1;36m│\x1b[0m ${num} \x1b[1;36m│\x1b[0m ${name} \x1b[1;36m│\x1b[0m ${creator} \x1b[1;36m│\x1b[0m ${stars} \x1b[1;36m│\x1b[0m ${likes} \x1b[1;36m│\x1b[0m ${downloads} \x1b[1;36m│\x1b[0m`);
        });

        console.log("\x1b[1;36m└─────┴──────────────────────────┴─────────────────┴──────────┴──────────┴────────┘\x1b[0m");

        console.log("\n\x1b[1;33mOptions:\x1b[0m");
        console.log("  \x1b[1;36m[#]\x1b[0m - View level details (enter level number)");
        console.log("  \x1b[1;36m[N]\x1b[0m - Next page");
        console.log("  \x1b[1;36m[P]\x1b[0m - Previous page");
        console.log("  \x1b[1;36m[R]\x1b[0m - Refine search (new filters)");
        console.log("  \x1b[1;36m[Q]\x1b[0m - Return to main menu");

        const choice = await question("\n\x1b[1;35mLEVEL SEARCH > \x1b[0m");

        if (choice.toLowerCase() === 'q') {
            viewing = false;
        } else if (choice.toLowerCase() === 'n') {
            currentPage++;
        } else if (choice.toLowerCase() === 'p') {
            if (currentPage > 0) {
                currentPage--;
            } else {
                console.log("\x1b[31mAlready on first page.\x1b[0m");
                await question("[Press Enter]");
            }
        } else if (choice.toLowerCase() === 'r') {
            await levelSearch(user);
            return;
        } else {
            const levelNum = parseInt(choice);
            if (!isNaN(levelNum) && levelNum >= 1 && levelNum <= levels.length) {
                await viewLevelDetails(levels[levelNum - 1].levelData, user);
            } else {
                console.log("\x1b[31mInvalid choice.\x1b[0m");
                await question("[Press Enter]");
            }
        }
    }
}

async function viewLevelDetails(levelData, user) {
    scene(`Level: ${levelData.levelName}`);

    // Display full level details
    const divider = "\x1b[90m" + "═".repeat(78) + "\x1b[0m";

    console.log(`\n${divider}`);
    console.log(`\x1b[1;36m📋 LEVEL INFORMATION\x1b[0m`);
    console.log(divider);

    // Title and basic info
    console.log(`\n\x1b[1;33m📝 Name:\x1b[0m ${levelData.levelName}`);
    console.log(`\x1b[1;33m🔢 Level ID:\x1b[0m ${levelData.levelID}`);
    console.log(`\x1b[1;33m👤 Creator:\x1b[0m ${levelData.author.username}`);

    // Difficulty and rating
    console.log(`\n${divider}`);
    console.log(`\x1b[1;36m⭐ RATINGS & DIFFICULTY\x1b[0m`);
    console.log(divider);

    const starDisplay = levelData.rating.stars > 0 ? `${levelData.rating.stars} ⭐` : "Unrated";
    if (levelData.rating.stars > 0) console.log(`\x1b[1;33mStars:\x1b[0m ${starDisplay}`);

    let difficultyName = levelData.difficulty.name;
    let difficultyEmoji = getDifficultyEmoji(levelData.difficulty);
    console.log(`\x1b[1;33mDifficulty:\x1b[0m ${difficultyName} ${difficultyEmoji}`);

    if (levelData.rating.featuredStatus !== "Not Featured") console.log(`\x1b[1;33m🏆 Featured`);
    if (levelData.rating.epicRating !== "None") {
        console.log(`\x1b[1;33m✨ Epic Rating:\x1b[0m ${levelData.rating.epicRating}`);
    }

    // Stats
    console.log(`\n${divider}`);
    console.log(`\x1b[1;36m📊 STATISTICS\x1b[0m`);
    console.log(divider);

    console.log(`\x1b[1;33m❤️ Likes:\x1b[0m ${utils.formatNumber(levelData.stats.likes)}`);
    console.log(`\x1b[1;33m⬇️ Downloads:\x1b[0m ${utils.formatNumber(levelData.stats.downloads)}`);

    if (levelData.stats.objects > 0) {
        console.log(`\x1b[1;33m🧩 Objects:\x1b[0m ${utils.formatNumber(levelData.stats.objects)}`);
        if (levelData.stats.isLargeLevel) {
            console.log(`\x1b[31m⚠️ Warning: Large level (>40k objects) may cause performance issues!\x1b[0m`);
        }
    }

    // Length
    console.log(`\x1b[1;33m📏 Length:\x1b[0m ${levelData.info.length.name}`);

    // Coins
    if (levelData.coins.total > 0) {
        console.log(`\x1b[1;33m🪙 Coins:\x1b[0m ${levelData.coins.total}`);
        if (levelData.coins.verified) {
            console.log(`\x1b[32m✓ Silver coins\x1b[0m`);
        }
    }

    // Music
    if (levelData.music) {
        console.log(`\n${divider}`);
        console.log(`\x1b[1;36m🎵 MUSIC\x1b[0m`);
        console.log(divider);
        if (levelData.music.officialSong) {
            const songName = enums.OfficialSongs.getName(levelData.music.officialSong);
            console.log(`\x1b[1;33mOfficial Song ID:\x1b[0m ${songName}`);
        }
        if (levelData.music.customSongID) {
            console.log(`\x1b[1;33mCustom Song ID:\x1b[0m ${levelData.music.customSongID}`);
        }
    }

    // Description
    if (levelData.description && levelData.description !== "") {
        console.log(`\n${divider}`);
        console.log(`\x1b[1;36m📝 DESCRIPTION\x1b[0m`);
        console.log(divider);
        console.log(`\x1b[0m${levelData.description}\x1b[0m`);
    }

    // Additional info
    if (levelData.info) {
        console.log(`\n${divider}`);
        console.log(`\x1b[1;36m📅 ADDITIONAL INFO\x1b[0m`);
        console.log(divider);
        if (levelData.info.gameVersion && levelData.info.gameVersion !== "Unknown") {
            console.log(`\x1b[1;33mGame Version:\x1b[0m ${levelData.info.gameVersion}`);
        }
        if (levelData.twoPlayer) {
            console.log(`\x1b[1;33m👥 Two Players`);
        }
        if (levelData.hasPassword) {
            console.log(`\x1b[1;33m🔒 Password Protected:\x1b[0m Yes`);
            if (levelData.password && levelData.password !== "0") {
                console.log(`\x1b[1;33mPassword:\x1b[0m ${levelData.password}`);
            }
        }
    }

    // Daily/Weekly
    if (levelData.special?.isDaily) {
        console.log(`\n\x1b[1;33m📅 This is a Daily Level (#${levelData.special.dailyNumber})\x1b[0m`);
    } else if (levelData.special?.isWeekly) {
        console.log(`\n\x1b[1;33m📅 This is a Weekly Level (#${levelData.special.dailyNumber - 100000})\x1b[0m`);
    }

    console.log(`\n${divider}`);

    // Download option
    console.log(`\n\x1b[1;33mOptions:\x1b[0m`);
    console.log(`  \x1b[1;36m[1]\x1b[0m Download this level`);
    console.log(`  \x1b[1;36m[2]\x1b[0m Return to search`);

    const downloadChoice = await question("\n\x1b[1;35mCHOICE > \x1b[0m");

    if (downloadChoice === '1') {
        await downloadLevel(levelData.levelID, levelData.levelName, levelData.music.officialSong, levelData.music.customSongID, levelData.author.username);
    }
}

async function downloadLevel(levelID, levelName, officialSongId, customSongId, creatorName) {
    scene("Downloading Level");

    console.log(`\x1b[1;33mDownloading level ${levelID}...\x1b[0m`);

    const res = await network.makeRequest('downloadGJLevel22.php', {
        levelID: levelID,
        secret: network.SECRETS.common,
        gameVersion: "22",
        binaryVersion: "47"
    }, DEBUG);

    if (!res || res === "-1") {
        console.log("\x1b[31mFailed to download level. Level may be unlisted or not exist.\x1b[0m");
        await question("[Press Enter]");
        return;
    }

    console.log("\x1b[32mLevel data received! Parsing...\x1b[0m");

    // Parse the level data using utils.parseLevel (no fetchUserInfo needed for download)
    const parsedLevel = await utils.parseLevel(res);

    if (!parsedLevel) {
        console.log("\x1b[31mFailed to parse level data.\x1b[0m");
        await question("[Press Enter]");
        return;
    }

    const levelString = parsedLevel.levelString;

    if (!levelString || levelString === "") {
        console.log("\x1b[31mLevel string is empty or corrupt.\x1b[0m");
        await question("[Press Enter]");
        return;
    }

    console.log(`\x1b[32mLevel parsed successfully! Creating .gmd file...\x1b[0m`);

    // Create the GMD file using utils.createGMD
    const fileName = utils.createGMD(levelName, creatorName, officialSongId ? null : customSongId, officialSongId || null, levelString);

    console.log(`\n\x1b[32m✓ Level saved as: ${fileName}\x1b[0m`);
    console.log(`\x1b[1;33mFile location: ${process.cwd()}\x1b[0m`);

    await question("\n[Press Enter to continue]");
}

// Helper functions
function getSearchTypeName(type) {
    const types = {
        0: "Search by name", 1: "Most downloaded", 2: "Most liked",
        3: "Trending", 4: "Recent", 5: "User's levels",
        6: "Featured", 7: "Magic", 8: "Mod sent",
        10: "Level list", 11: "Awarded", 12: "Followed",
        13: "Friends", 21: "Daily history", 22: "Weekly history"
    };
    return types[type] || "Unknown";
}

function getDifficultyEmoji(difficulty) {
    if (difficulty.isAuto) return "🤖";
    if (difficulty.isDemon) {
        const demonEmojis = {
            3: "😈",   // Easy Demon
            4: "👿",   // Medium Demon  
            0: "💀",   // Hard Demon
            5: "🔱",   // Insane Demon
            6: "👺"    // Extreme Demon
        };
        return demonEmojis[difficulty.demonDifficulty] || "😈";
    }

    const diffEmojis = {
        10: "🔵",  // Easy
        20: "🟢",  // Normal
        30: "🟡",  // Hard
        40: "🔴",  // Harder
        50: "🟣"   // Insane
    };
    return diffEmojis[difficulty.icon] || "⚪";
}

function getEpicEmoji(epicRating) {
    if (epicRating === "Epic") return "✨";
    if (epicRating === "Legendary") return "🔥";
    if (epicRating === "Mythic") return "💜";
    return "";
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
        console.log(` \x1b[1;36m[9]\x1b[0m Read Personal User List \x1b[1;36m[10]\x1b[0m Check daily/weekly`);
        console.log(` \x1b[1;36m[11]\x1b[0m Read Messages          \x1b[1;36m[12]\x1b[0m Send a Message`);
        console.log(` \x1b[1;36m[13]\x1b[0m Check user             \x1b[1;36m[14]\x1b[0m Level Search`);
        console.log(` \x1b[1;31m[15]\x1b[0m Logout & Exit          \x1b[1;31m[16]\x1b[0m Exit\n`);

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
        else if (choice === '11') await readMessages(user);
        else if (choice === '12') await sendMessage(user);
        else if (choice === '13') await lookupUser(user);
        else if (choice === '14') await levelSearch(user);
        else if (choice === '15') { await logout(); break; }
        else if (choice === '16') process.exit();
    }
}

/** ---------------- START ---------------- **/
(async () => {
    const saved = await auth.loadAuth();
    if (saved) await mainMenu(saved);
    else await startFlow();
})();