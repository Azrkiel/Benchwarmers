// Turns the drive script into a timeline of "beats" the live game replays.
// Each beat carries the game situation after it, the text for the play ticker,
// and the stat changes it causes. The whole game is computed up front so it is
// deterministic and easy to test (`npm run check`).

import { DRIVES, HALFTIME_TEXT, FINAL_TEXT } from './script.js';
import { PLAYER_BY_ID, TEAMS } from './data.js';

const QB = { VT: 'will-power', SD: 'al-beback' };
const KICKER = { VT: 'justin-time', SD: 'chip-shot' };
const LONG_SNAPPER = { VT: 'ben-dover', SD: null };
const OLINE = { VT: ['hugh-jass'], SD: ['holden-penalty', 'harry-butz'] };
const other = (team) => (team === 'VT' ? 'SD' : 'VT');
const nameOf = (id) => PLAYER_BY_ID[id]?.name ?? id;

export const toSec = (clock) => {
  const [m, s] = clock.split(':').map(Number);
  return m * 60 + s;
};
export const fmtClock = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const ordinal = (n) => ['', '1st', '2nd', '3rd', '4th'][n] ?? `${n}th`;

// "VT 35" or "SD 22": field position from the offense's point of view.
export function spotLabel(off, ballOn) {
  if (ballOn === 50) return 'midfield';
  return ballOn < 50 ? `${off} ${ballOn}` : `${other(off)} ${100 - ballOn}`;
}
// Position on the drawn field: 0 = Morning Wood's goal line (left), 100 = Swiss Cheese's (right).
export const fieldX = (off, ballOn) => (off === 'VT' ? ballOn : 100 - ballOn);

export function buildTimeline() {
  const beats = [];
  const warnings = [];
  const score = { VT: 0, SD: 0 };
  const push = (beat) => beats.push({ ...beat, i: beats.length, score: { ...score } });

  DRIVES.forEach((drive, d) => {
    const off = drive.off;
    const def = other(off);
    const startSec = toSec(drive.start);
    const step = (startSec - toSec(drive.end)) / drive.plays.length;
    let ballOn = drive.ball;
    let down = 1;
    let togo = Math.min(10, 100 - ballOn);
    let outcome = null;
    let endBallOn = ballOn;
    const isLastDrive = d === DRIVES.length - 1;

    push({
      type: 'drive_start', drive: d, q: drive.q, clock: drive.start, off,
      ballOn, down, togo, fieldX: fieldX(off, ballOn), deltas: [], kind: 'drive',
      text: `${TEAMS[off].name} ball at the ${spotLabel(off, ballOn)}. Call the drive before the snap!`,
    });

    drive.plays.forEach((p, k) => {
      const clock = fmtClock(startSec - step * (k + 1));
      const situation = `${ordinal(down)} & ${togo >= 100 - ballOn ? 'Goal' : togo} at ${spotLabel(off, ballOn)}`;
      const deltas = [];
      const add = (pid, stat, n = 1) => pid && deltas.push([pid, stat, n]);
      let text = p.text;
      let kind = 'normal';
      let gain = 0;
      let scored = null; // team that scored a TD on this play
      const toGoal = 100 - ballOn;

      if ((p.t === 'punt' || (p.t === 'fg' && !isLastDrive)) && down !== 4) {
        warnings.push(`Drive ${d + 1}: ${p.t} on ${ordinal(down)} down`);
      }

      switch (p.t) {
        case 'run':
        case 'pass': {
          const td = p.yds === 'TD';
          gain = td ? toGoal : p.yds;
          if (!td && gain >= toGoal) warnings.push(`Drive ${d + 1} play ${k + 1}: ${gain} yds reaches the end zone but isn't marked TD`);
          if (p.t === 'run') {
            add(p.by, 'rushYds', gain);
            OLINE[off].forEach((ol) => add(ol, 'teamRushYds', gain));
            if (td) {
              add(p.by, 'rushTD');
              OLINE[off].forEach((ol) => add(ol, 'teamRushTD'));
            }
            text ??= `${nameOf(p.by)} runs for ${gain} yard${gain === 1 ? '' : 's'}.` +
              (p.tackler ? ` Brought down by ${nameOf(p.tackler)}.` : '');
          } else {
            add(QB[off], 'passYds', gain);
            add(p.to, 'rec');
            add(p.to, 'recYds', gain);
            if (td) {
              add(QB[off], 'passTD');
              add(p.to, 'recTD');
            }
            text ??= `${nameOf(QB[off])} hits ${nameOf(p.to)} for ${gain} yard${gain === 1 ? '' : 's'}.` +
              (p.tackler ? ` ${nameOf(p.tackler)} makes the stop.` : '');
          }
          if (p.tackler) add(p.tackler, 'tackles');
          if (td) {
            kind = 'td';
            scored = off;
            ballOn = 100;
          } else {
            ballOn += gain;
            if (gain >= togo) {
              down = 1;
              togo = Math.min(10, 100 - ballOn);
              if (gain >= 15) kind = 'big';
            } else {
              down += 1;
              togo -= gain;
            }
          }
          break;
        }
        case 'inc':
        case 'spike': {
          if (p.defender) add(p.defender, 'passDefended');
          text ??= `Incomplete, intended for ${nameOf(p.to)}.` + (p.defender ? ` Broken up by ${nameOf(p.defender)}.` : '');
          down += 1;
          break;
        }
        case 'sack': {
          add(p.by, 'sacks');
          add(p.allowedBy, 'sacksAllowed');
          gain = -p.yds;
          ballOn -= p.yds;
          togo += p.yds;
          down += 1;
          kind = 'sack';
          text ??= `SACK! ${nameOf(p.by)} drops ${nameOf(QB[off])} for a loss of ${p.yds}.`;
          break;
        }
        case 'pen': {
          add(p.on, 'penalties');
          gain = -p.yds;
          ballOn -= p.yds;
          togo += p.yds;
          kind = 'pen';
          break;
        }
        case 'int': {
          add(QB[off], 'intThrown');
          add(p.by, 'defInt');
          kind = 'int';
          outcome = 'TURNOVER';
          if (p.pick6) {
            add(p.by, 'defTD');
            scored = def;
            kind = 'td';
          }
          break;
        }
        case 'fumble': {
          add(p.by, 'fumLost');
          add(p.recoveredBy, 'fumRec');
          kind = 'int';
          outcome = 'TURNOVER';
          endBallOn = ballOn;
          break;
        }
        case 'punt': {
          add(p.by, 'puntYds', p.yds);
          if (p.in20) add(p.by, 'puntIn20');
          add(LONG_SNAPPER[off], 'cleanSnaps');
          text ??= `${nameOf(p.by)} punts it ${p.yds} yards.`;
          kind = 'punt';
          outcome = 'PUNT';
          endBallOn = ballOn + p.yds;
          break;
        }
        case 'fg': {
          add(LONG_SNAPPER[off], 'cleanSnaps');
          if (p.made) {
            add(p.by, p.dist >= 50 ? 'fg50' : p.dist >= 40 ? 'fg40' : 'fg');
            score[off] += 3;
            outcome = 'FG';
          } else {
            outcome = 'TURNOVER';
          }
          if (p.dist !== toGoal + 17) warnings.push(`Drive ${d + 1}: FG listed as ${p.dist} yds but spot gives ${toGoal + 17}`);
          kind = 'fg';
          break;
        }
        default:
          throw new Error(`Unknown play type ${p.t}`);
      }

      if (down > 4 && !outcome && !scored) warnings.push(`Drive ${d + 1} play ${k + 1}: turnover on downs`);
      if (scored) {
        score[scored] += 6;
        outcome = scored === off ? 'TD' : 'TURNOVER';
      }

      push({
        type: 'play', drive: d, q: drive.q, clock, off, situation, play: p.t,
        ballOn: Math.min(ballOn, 100), down, togo, gain,
        fieldX: fieldX(off, Math.min(ballOn, 100)),
        deltas, kind, text,
      });

      if (scored) {
        const kicker = KICKER[scored];
        const pat = [[kicker, 'xp', 1]];
        if (LONG_SNAPPER[scored]) pat.push([LONG_SNAPPER[scored], 'cleanSnaps', 1]);
        score[scored] += 1;
        push({
          type: 'pat', drive: d, q: drive.q, clock, off, ballOn: 100, down, togo,
          fieldX: scored === 'VT' ? 100 : 0, deltas: pat, kind: 'pat',
          text: `${nameOf(kicker)} adds the extra point.`,
        });
      }
    });

    if (!outcome) warnings.push(`Drive ${d + 1}: ended without a result`);

    // Sanity check the next drive's starting spot after punts and fumbles.
    const next = DRIVES[d + 1];
    if (next && next.q === drive.q && outcome === 'PUNT') {
      const expected = 100 - endBallOn;
      if (Math.abs(expected - next.ball) > 3) warnings.push(`Drive ${d + 2}: starts at ${next.ball}, punt suggests ${expected}`);
    }
    if (next && outcome === 'TURNOVER' && drive.plays.at(-1).t === 'fumble') {
      const expected = 100 - endBallOn;
      if (Math.abs(expected - next.ball) > 3) warnings.push(`Drive ${d + 2}: starts at ${next.ball}, fumble spot suggests ${expected}`);
    }

    const label = { TD: 'Touchdown', FG: 'Field goal', PUNT: 'Punt', TURNOVER: 'Turnover' }[outcome];
    push({
      type: 'drive_end', drive: d, q: drive.q, clock: drive.end, off, outcome,
      ballOn, down, togo, fieldX: beats.at(-1).fieldX, deltas: [], kind: 'drive_end',
      text: `Drive result: ${label}. ${TEAMS.VT.name} ${score.VT}, ${TEAMS.SD.name} ${score.SD}.`,
    });

    if (next && next.q === 3 && drive.q === 2) {
      push({ type: 'halftime', drive: d, q: 2, clock: '0:00', off, ballOn: 50, down: 1, togo: 10, fieldX: 50, deltas: [], kind: 'halftime', text: HALFTIME_TEXT });
    }
  });

  push({ type: 'final', drive: DRIVES.length - 1, q: 4, clock: '0:00', off: 'VT', ballOn: 50, down: 1, togo: 10, fieldX: 50, deltas: [], kind: 'final', text: FINAL_TEXT });

  return { beats, warnings, driveCount: DRIVES.length };
}
