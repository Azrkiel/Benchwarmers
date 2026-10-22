// The scripted game: South Dakota Swiss Cheese at Vermont's Morning Wood.
// Final: Morning Wood 27, Swiss Cheese 24 (Justin Time walk-off field goal).
//
// Each drive lists its plays. The engine (timeline.js) works out down,
// distance, field position, clock, score, and every player's stats from this,
// and `npm run check` validates that the script is consistent.
//
// ball = where the drive starts, in yards from the offense's own goal line.

const run = (by, yds, tackler, text) => ({ t: 'run', by, yds, tackler, text });
const pass = (to, yds, tackler, text) => ({ t: 'pass', to, yds, tackler, text });
const inc = (to, defender, text) => ({ t: 'inc', to, defender, text });
const spike = (text) => ({ t: 'spike', text });
const sack = (by, yds, allowedBy, text) => ({ t: 'sack', by, yds, allowedBy, text });
const pen = (on, yds, text) => ({ t: 'pen', on, yds, text });
const int = (by, ret, text, opts = {}) => ({ t: 'int', by, ret, text, ...opts });
const fumble = (by, recoveredBy, text) => ({ t: 'fumble', by, recoveredBy, text });
const punt = (by, yds, in20, text) => ({ t: 'punt', by, yds, in20, text });
const fg = (by, dist, made, text) => ({ t: 'fg', by, dist, made, text });
const TD = 'TD';

export const DRIVES = [
  // ---------------- 1st quarter ----------------
  {
    off: 'VT', q: 1, start: '15:00', end: '10:42', ball: 25,
    plays: [
      run('max-yardage', 6, 'hugh-janus', 'Max Yardage bursts off left tackle behind Hugh Jass. 6 yards.'),
      pass('robin-banks', 12, 'oliver-klozoff'),
      run('max-yardage', 4, 'doug-graves'),
      pass('lance-downfield', 18, 'ip-freely', 'Lance Downfield gets behind Oliver Klozoff for 18. The Swiss Cheese secondary is living up to the name.'),
      pen('hugh-jass', 5, 'FLAG. False start, Hugh Jass. Hal Jablowski says the big man moved early. 5-yard penalty.'),
      pass('major-package', 14, 'ip-freely'),
      run('max-yardage', 3, 'doug-graves'),
      pass('robin-banks', 11, 'oliver-klozoff', 'Robin Banks steals one over the middle. 11 yards.'),
      run('max-yardage', 2, 'hugh-janus'),
      pass('major-package', TD, null, 'TOUCHDOWN! Will Power finds Major Package all alone in the back of the end zone.'),
    ],
  },
  {
    off: 'SD', q: 1, start: '10:38', end: '8:55', ball: 25,
    plays: [
      run('hank-off', 3, 'barb-dwyer'),
      pen('holden-penalty', 10, 'FLAG. Holding, number 71, Holden Penalty. First of many, folks. 10-yard penalty.'),
      pass('mike-rotch', 6, 'pick-sixx'),
      inc('rick-oshea', 'justin-case', 'Al Beback overthrows Rick O\'Shea. Justin Case was there, just in case.'),
      punt('chip-shot', 41, false),
    ],
  },
  {
    off: 'VT', q: 1, start: '8:50', end: '6:30', ball: 35,
    plays: [
      run('max-yardage', 2, 'hugh-janus'),
      sack('hugh-janus', 7, 'hugh-jass', 'SACK! Hugh Janus beats Hugh Jass. It\'s a battle of the Hughs, and the wrong Hugh won.'),
      pass('lance-downfield', 9, 'oliver-klozoff'),
      punt('phil-mccracken', 49, true, 'Phil McCracken booms it. Downed at the 12. Clean snap from Ben Dover.'),
    ],
  },
  {
    off: 'SD', q: 1, start: '6:24', end: '0:41', ball: 12,
    plays: [
      pass('ford-progress', 9, 'seymour-butts', 'Ford Progress picks up 9. Forward progress, as advertised.'),
      run('hank-off', 4, 'barb-dwyer'),
      pass('rick-oshea', 16, 'justin-case'),
      run('hank-off', 7, 'seymour-butts'),
      pass('mike-rotch', 12, 'pick-sixx', 'Mike Rotch makes the grab. Pick Sixx a step late. 12 yards.'),
      run('hank-off', 9, 'barb-dwyer'),
      run('hank-off', 2, 'seymour-butts'),
      inc('ford-progress', 'barb-dwyer'),
      sack('barb-dwyer', 6, 'harry-butz', 'SACK! Barb Dwyer swims right around Harry Butz.'),
      pass('mike-rotch', 14, 'justin-case'),
      fg('chip-shot', 38, true, 'Chip Shot from 38... good. Lived up to the name.'),
    ],
  },

  // ---------------- 2nd quarter ----------------
  {
    off: 'VT', q: 2, start: '15:00', end: '9:12', ball: 25,
    plays: [
      pass('robin-banks', 8, 'oliver-klozoff'),
      run('max-yardage', 5, 'doug-graves'),
      pass('lance-downfield', 22, 'ip-freely', 'Lance Downfield runs free past I.P. Freely. 22 yards.'),
      run('max-yardage', 6, 'hugh-janus'),
      pass('major-package', 9, 'doug-graves', 'Major Package delivers again. 9 yards.'),
      run('max-yardage', 11, 'oliver-klozoff'),
      inc('robin-banks', 'oliver-klozoff', 'Oliver Klozoff gets a hand on it! A rare sighting.'),
      run('max-yardage', 7, 'doug-graves'),
      run('max-yardage', TD, null, 'TOUCHDOWN! Max Yardage plows in behind Hugh Jass.'),
    ],
  },
  {
    off: 'SD', q: 2, start: '9:06', end: '8:20', ball: 25,
    plays: [
      pass('ford-progress', 7, 'seymour-butts'),
      int('pick-sixx', 46, 'INTERCEPTED! Al Beback throws it right to Pick Sixx... and you know what Pick Sixx does. 46 yards. TOUCHDOWN!', { pick6: true }),
    ],
  },
  {
    off: 'SD', q: 2, start: '8:15', end: '3:02', ball: 25,
    plays: [
      run('hank-off', 4, 'barb-dwyer'),
      pass('rick-oshea', 11, 'justin-case', 'Off Justin Case\'s hands and into Rick O\'Shea\'s. Ricochet catch, 11 yards.'),
      pass('mike-rotch', 9, 'pick-sixx'),
      run('hank-off', 3, 'seymour-butts'),
      pen('holden-penalty', 10, 'FLAG. Holding. Holden Penalty. Again. Hal Jablowski is on a first-name basis with him now.'),
      pass('ford-progress', 17, 'barb-dwyer'),
      run('hank-off', 6, 'barb-dwyer'),
      pass('mike-rotch', 21, 'justin-case', 'Mike Rotch beats Justin Case deep. 21 yards.'),
      run('hank-off', 3, 'seymour-butts'),
      pass('mike-rotch', TD, null, 'TOUCHDOWN! Mike Rotch has the hands tonight.'),
    ],
  },
  {
    off: 'VT', q: 2, start: '2:57', end: '0:22', ball: 25,
    plays: [
      pass('robin-banks', 7, 'oliver-klozoff'),
      run('max-yardage', 2, 'doug-graves'),
      run('max-yardage', 3, 'hugh-janus'),
      inc('lance-downfield', 'ip-freely'),
      sack('doug-graves', 8, 'hugh-jass', 'SACK! Doug Graves buries Will Power. Hugh Jass got turned around.'),
      pass('major-package', 6, 'doug-graves'),
      punt('phil-mccracken', 47, true, 'Phil McCracken pins it at the 18.'),
    ],
  },

  // ---------------- 3rd quarter ----------------
  {
    off: 'SD', q: 3, start: '15:00', end: '12:40', ball: 25,
    plays: [
      run('hank-off', 2, 'barb-dwyer'),
      pass('rick-oshea', 5, 'justin-case'),
      sack('seymour-butts', 9, 'harry-butz', 'SACK! Seymour Butts comes off the edge untouched. Harry Butz never saw him.'),
      punt('chip-shot', 44, false),
    ],
  },
  {
    off: 'VT', q: 3, start: '12:34', end: '7:50', ball: 33,
    plays: [
      run('max-yardage', 5, 'hugh-janus'),
      pass('lance-downfield', 13, 'oliver-klozoff'),
      run('max-yardage', 4, 'doug-graves'),
      pass('robin-banks', 9, 'ip-freely'),
      inc('major-package', 'doug-graves'),
      run('max-yardage', 4, 'hugh-janus'),
      pass('robin-banks', 5, 'oliver-klozoff'),
      fg('justin-time', 44, true, 'Justin Time from 44... GOOD. Right on time.'),
    ],
  },
  {
    off: 'SD', q: 3, start: '7:44', end: '6:58', ball: 25,
    plays: [
      run('hank-off', 5, 'barb-dwyer'),
      pass('mike-rotch', 8, 'pick-sixx'),
      fumble('al-beback', 'barb-dwyer', 'BUTT FUMBLE! Al Beback scrambles face-first into the backside of his own right tackle, Harry Butz. The ball pops loose and Barb Dwyer pounces on it!'),
    ],
  },
  {
    off: 'VT', q: 3, start: '6:53', end: '0:12', ball: 62,
    plays: [
      run('max-yardage', 3, 'hugh-janus'),
      pass('major-package', 10, 'ip-freely'),
      run('max-yardage', 1, 'doug-graves'),
      pass('robin-banks', 6, 'oliver-klozoff'),
      run('max-yardage', 4, 'ip-freely'),
      inc('lance-downfield', 'ip-freely'),
      int('oliver-klozoff', 0, 'Wait for it... INTERCEPTED in the end zone by Oliver Klozoff! The Swiss Cheese finally plug a hole. Touchback.'),
    ],
  },

  // ---------------- 4th quarter ----------------
  {
    off: 'SD', q: 4, start: '15:00', end: '10:05', ball: 20,
    plays: [
      pass('rick-oshea', 9, 'justin-case', 'Al Beback said he\'d be back. 9 yards to Rick O\'Shea.'),
      run('hank-off', 4, 'barb-dwyer'),
      pass('mike-rotch', 15, 'pick-sixx'),
      pass('ford-progress', 8, 'seymour-butts'),
      run('hank-off', 3, 'barb-dwyer'),
      pen('holden-penalty', 10, 'FLAG. Holding. Holden Penalty. That\'s three. Somebody check his wallet.'),
      pass('rick-oshea', 24, 'justin-case'),
      run('hank-off', 6, 'seymour-butts'),
      pass('ford-progress', 9, 'barb-dwyer'),
      pass('rick-oshea', TD, null, 'TOUCHDOWN! Al Beback fires, it bounces off a helmet and ricochets right into Rick O\'Shea\'s hands!'),
    ],
  },
  {
    off: 'VT', q: 4, start: '10:00', end: '6:44', ball: 25,
    plays: [
      run('max-yardage', 3, 'hugh-janus'),
      run('max-yardage', 4, 'doug-graves'),
      pen('hugh-jass', 5, 'FLAG. False start, Hugh Jass. Again.'),
      pass('lance-downfield', 6, 'oliver-klozoff'),
      punt('phil-mccracken', 52, true, 'Phil McCracken\'s best of the night. 52 yards, downed at the 15.'),
    ],
  },
  {
    off: 'SD', q: 4, start: '6:38', end: '1:10', ball: 15,
    plays: [
      pass('mike-rotch', 11, 'pick-sixx'),
      run('hank-off', 6, 'barb-dwyer'),
      pass('rick-oshea', 14, 'justin-case'),
      sack('barb-dwyer', 7, 'holden-penalty', 'SACK! Barb Dwyer blows past Holden Penalty, who for once didn\'t grab anybody.'),
      pass('ford-progress', 19, 'seymour-butts'),
      pass('mike-rotch', 12, 'pick-sixx'),
      inc('rick-oshea', 'justin-case'),
      run('hank-off', 9, 'barb-dwyer'),
      run('hank-off', 3, 'seymour-butts'),
      pass('ford-progress', 11, 'seymour-butts'),
      run('hank-off', TD, null, 'TOUCHDOWN! Hank Off dives in! Al Beback has brought them all the way back. TIE GAME!'),
    ],
  },
  {
    off: 'VT', q: 4, start: '1:05', end: '0:00', ball: 25,
    plays: [
      pass('robin-banks', 14, 'oliver-klozoff', 'Robin Banks, 14 yards. Two-minute drill is on.'),
      pass('lance-downfield', 11, 'ip-freely', 'Lance Downfield, 11 yards and out of bounds.'),
      inc('major-package', 'doug-graves'),
      pass('major-package', 13, 'ip-freely', 'Major Package with a big grab across midfield!'),
      spike('Will Power spikes it to stop the clock.'),
      pass('robin-banks', 7, 'oliver-klozoff'),
      fg('justin-time', 47, true, 'Justin Time... from 47... as time expires... IT\'S GOOD! MORNING WOOD WINS IT, RIGHT ON TIME!'),
    ],
  },
];

export const HALFTIME_TEXT =
  "HALFTIME. Amanda Hugginkiss reports from the sideline: Holden Penalty has been flagged twice and says he's \"barely touching people.\" Ivana Tinkle has refilled the water cooler.";

export const FINAL_TEXT =
  "FINAL: Morning Wood 27, Swiss Cheese 24. Justin Time is carried off the field. Head ref Hal Jablowski reviews nothing and goes home.";
