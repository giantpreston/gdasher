const OfficialSongs = Object.freeze({
    0: "Stereo Madness",
    1: "Back On Track",
    2: "Polargeist",
    3: "Dry Out",
    4: "Base after Base",
    5: "Cant Let Go",
    6: "Jumper",
    7: "Time Machine",
    8: "Cycles",
    9: "xStep",
    10: "Clutterfunk",
    11: "Theory of Everything",
    12: "Electroman Adventures",
    13: "Clubstep",
    14: "Electrodynamix",
    15: "Hexagon Force",
    16: "Blast Processing",
    17: "Theory of Everything 2",
    18: "Geometrical Dominator",
    19: "Deadlocked",
    20: "Fingerdash",
    21: "Dash",
    22: "Explorers",
    getName(id) {
        return this[id] || `Unknown Official Song (ID: ${id})`;
    },

    getAll() {
        return Object.entries(this)
            .filter(([key]) => !isNaN(parseInt(key)))
            .map(([id, name]) => ({ id: parseInt(id), name }));
    }
});

module.exports = { OfficialSongs };