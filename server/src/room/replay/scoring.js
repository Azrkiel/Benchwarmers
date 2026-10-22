// Fantasy scoring. Every position can score, including the linemen,
// long snapper, and punter, so the cheap "bench" names are real value picks.

export const SCORING = {
  QB: { passYds: 0.04, passTD: 4, intThrown: -1, rushYds: 0.1, rushTD: 6, fumLost: -2 },
  SKILL: { rec: 1, recYds: 0.1, recTD: 6, rushYds: 0.1, rushTD: 6, fumLost: -2 },
  K: { xp: 1, fg: 3, fg40: 4, fg50: 5, puntYds: 0.04, puntIn20: 1.5 },
  DEF: { tackles: 1, sacks: 3, defInt: 4, passDefended: 1.5, fumRec: 3, defTD: 6 },
  OL: { teamRushYds: 0.1, teamRushTD: 2, sacksAllowed: -2, penalties: -1.5 },
  LS: { cleanSnaps: 1 },
  P: { puntYds: 0.04, puntIn20: 1.5 },
};

// A short plain-English version for the UI and the MCP tool description.
export const SCORING_SUMMARY = [
  'QB: 0.04/pass yd, 4/pass TD, -1/INT, 0.1/rush yd, 6/rush TD',
  'RB/WR/TE: 1/catch, 0.1/yd, 6/TD',
  'K: 1/XP, 3/FG (4 from 40+, 5 from 50+)',
  'Defenders: 1/tackle, 3/sack, 4/INT, 1.5/pass defended, 3/fumble recovery, 6/TD',
  'O-line: 0.1/team rush yd, 2/team rush TD, -2/sack allowed, -1.5/penalty',
  'Long snapper: 1/clean snap',
  'Punter: 0.04/punt yd, 1.5/punt inside the 20',
  'Captain: 1.5x points',
];

export function fantasyPoints(stats, role) {
  if (!stats) return 0;
  const s = (k) => stats[k] || 0;
  switch (role) {
    case 'QB': {
      const r = SCORING.QB;
      return s('passYds') * r.passYds + s('passTD') * r.passTD + s('intThrown') * r.intThrown +
        s('rushYds') * r.rushYds + s('rushTD') * r.rushTD + s('fumLost') * r.fumLost;
    }
    case 'SKILL': {
      const r = SCORING.SKILL;
      return s('rec') * r.rec + s('recYds') * r.recYds + s('recTD') * r.recTD +
        s('rushYds') * r.rushYds + s('rushTD') * r.rushTD + s('fumLost') * r.fumLost;
    }
    case 'K': {
      const r = SCORING.K;
      return s('xp') * r.xp + s('fg') * r.fg + s('fg40') * r.fg40 + s('fg50') * r.fg50 +
        s('puntYds') * r.puntYds + s('puntIn20') * r.puntIn20;
    }
    case 'DEF': {
      const r = SCORING.DEF;
      return s('tackles') * r.tackles + s('sacks') * r.sacks + s('defInt') * r.defInt +
        s('passDefended') * r.passDefended + s('fumRec') * r.fumRec + s('defTD') * r.defTD;
    }
    case 'OL': {
      const r = SCORING.OL;
      return s('teamRushYds') * r.teamRushYds + s('teamRushTD') * r.teamRushTD +
        s('sacksAllowed') * r.sacksAllowed + s('penalties') * r.penalties;
    }
    case 'LS':
      return s('cleanSnaps') * SCORING.LS.cleanSnaps;
    case 'P':
      return s('puntYds') * SCORING.P.puntYds + s('puntIn20') * SCORING.P.puntIn20;
    default:
      return 0;
  }
}

export const round1 = (n) => Math.round(n * 10) / 10;
