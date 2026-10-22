// Teams, rosters, salaries, and the bot crowd for the demo watch party.
// Everything here is fictional: team names, player names, and the game itself.

export const TEAMS = {
  VT: {
    id: 'VT',
    name: 'Morning Wood',
    city: 'Vermont',
    full: "Vermont's Morning Wood",
    color: '#c8641e',
    accent: '#f4e3c3',
  },
  SD: {
    id: 'SD',
    name: 'Swiss Cheese',
    city: 'South Dakota',
    full: 'South Dakota Swiss Cheese',
    color: '#e8b931',
    accent: '#26324a',
  },
};

// role = how the player scores (see scoring.js). pos = what the roster card shows.
export const PLAYERS = [
  // Vermont's Morning Wood
  { id: 'will-power', name: 'Will Power', team: 'VT', pos: 'QB', role: 'QB', salary: 11000 },
  { id: 'max-yardage', name: 'Max Yardage', team: 'VT', pos: 'RB', role: 'SKILL', salary: 9200 },
  { id: 'robin-banks', name: 'Robin Banks', team: 'VT', pos: 'WR', role: 'SKILL', salary: 8400 },
  { id: 'lance-downfield', name: 'Lance Downfield', team: 'VT', pos: 'WR', role: 'SKILL', salary: 7000 },
  { id: 'major-package', name: 'Major Package', team: 'VT', pos: 'TE', role: 'SKILL', salary: 6200 },
  { id: 'justin-time', name: 'Justin Time', team: 'VT', pos: 'K', role: 'K', salary: 4600 },
  { id: 'barb-dwyer', name: 'Barb Dwyer', team: 'VT', pos: 'LB', role: 'DEF', salary: 4000 },
  { id: 'pick-sixx', name: 'Pick Sixx', team: 'VT', pos: 'CB', role: 'DEF', salary: 3800 },
  { id: 'justin-case', name: 'Justin Case', team: 'VT', pos: 'FS', role: 'DEF', salary: 3400 },
  { id: 'seymour-butts', name: 'Seymour Butts', team: 'VT', pos: 'SS', role: 'DEF', salary: 3200 },
  { id: 'hugh-jass', name: 'Hugh Jass', team: 'VT', pos: 'OL', role: 'OL', salary: 3000 },
  { id: 'phil-mccracken', name: 'Phil McCracken', team: 'VT', pos: 'P', role: 'P', salary: 2000 },
  { id: 'ben-dover', name: 'Ben Dover', team: 'VT', pos: 'LS', role: 'LS', salary: 1500 },

  // South Dakota Swiss Cheese
  { id: 'al-beback', name: 'Al Beback', team: 'SD', pos: 'QB', role: 'QB', salary: 10600 },
  { id: 'hank-off', name: 'Hank Off', team: 'SD', pos: 'RB', role: 'SKILL', salary: 8800 },
  { id: 'rick-oshea', name: "Rick O'Shea", team: 'SD', pos: 'WR', role: 'SKILL', salary: 8000 },
  { id: 'mike-rotch', name: 'Mike Rotch', team: 'SD', pos: 'WR', role: 'SKILL', salary: 6800 },
  { id: 'ford-progress', name: 'Ford Progress', team: 'SD', pos: 'TE', role: 'SKILL', salary: 5800 },
  { id: 'chip-shot', name: 'Chip Shot', team: 'SD', pos: 'K/P', role: 'K', salary: 4400 },
  { id: 'hugh-janus', name: 'Hugh Janus', team: 'SD', pos: 'DL', role: 'DEF', salary: 4200 },
  { id: 'doug-graves', name: 'Doug Graves', team: 'SD', pos: 'LB', role: 'DEF', salary: 3800 },
  { id: 'oliver-klozoff', name: 'Oliver Klozoff', team: 'SD', pos: 'CB', role: 'DEF', salary: 3600 },
  { id: 'ip-freely', name: 'I.P. Freely', team: 'SD', pos: 'S', role: 'DEF', salary: 3400 },
  { id: 'holden-penalty', name: 'Holden Penalty', team: 'SD', pos: 'LT', role: 'OL', salary: 2800 },
  { id: 'harry-butz', name: 'Harry Butz', team: 'SD', pos: 'RT', role: 'OL', salary: 2600 },
];

export const PLAYER_BY_ID = Object.fromEntries(PLAYERS.map((p) => [p.id, p]));

export const LINEUP_RULES = {
  salaryCap: 50000,
  flexSlots: 4,
  captainMultiplier: 1.5, // captain scores 1.5x and costs 1.5x
};

// Points for calling the result of a drive before the first snap.
// Rarer outcomes pay more.
export const PREDICTION_POINTS = {
  TD: 10,
  FG: 12,
  PUNT: 6,
  TURNOVER: 15,
};

export const PREDICTION_LABELS = {
  TD: 'Touchdown',
  FG: 'Field goal',
  PUNT: 'Punt',
  TURNOVER: 'Turnover',
};

// The rest of the watch party. 29 bots + you = a 30-person room.
export const BOT_NAMES = [
  'Couch Coach Carl',
  'Aunt Linda',
  'Tailgate Tina',
  'Remote Hog',
  'Dip Lord',
  'Wing Queen',
  'Big Mike',
  'Uncle Rick',
  'Nana Ruth',
  'Buffalo Dip Dan',
  'Lazy Sunday Sam',
  'Fumble Phil',
  'Hot Take Hannah',
  'Stats Nerd Steve',
  'Seven Layer Kelly',
  'Cooler Kyle',
  'Brisket Bob',
  'Overtime Olivia',
  'Recliner Ray',
  'Snack Table Sarah',
  'Hail Mary Marie',
  'Red Zone Rosa',
  'Two-Point Tony',
  'Blitz Betty',
  'Chip Dip Charlie',
  'Grill Master Gus',
  'Foam Finger Fiona',
  'Nacho Average Joe',
  'Halftime Hal',
];
