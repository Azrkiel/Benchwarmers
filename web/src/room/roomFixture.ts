// Shared RoomView fixture for room tests.
const players = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, teamId: 'h', teamShort: 'HOM', position: ['QB', 'RB', 'WR', 'OL', 'LS', 'P'][i], role: 'Fictional player', salary: i === 5 ? 40000 : 8000, multiplier: 1, stats: {}, rawPoints: 0, points: 0, statLine: 'No stats yet' }));
export const fixture = {
  room: { code: 'ABCD', name: 'Sunday room', seasonId: 'season-1', phase: 'lobby', speed: 1, participantCount: 1, createdAt: 1 },
  game: { title: 'Hogs at Owls', home: { id: 'h', short: 'HOM', name: 'Hogs', color: '#a34', score: 0 }, away: { id: 'a', short: 'AWY', name: 'Owls', color: '#34a', score: 0 }, quarter: 1, clock: '15:00', situation: 'Kickoff', ballOn: 'HOM 25', fieldX: 25, possession: 'h', driveNumber: 1, driveCount: 10, recentPlays: [], isScripted: true },
  rules: { salaryCap: 50000, flexSlots: 4, captainMultiplier: 1.5, positionMultipliers: {}, pickFactorCap: 5 }, players,
  standings: [{ participantId: 'person-1', name: 'Taylor', rank: 1, total: 0, fantasyPoints: 0, predictionPoints: 0, streak: 0, roster: [] }],
  me: { participantId: 'person-1', name: 'Taylor' }, season: { id: 'season-1', name: 'Demo season', standings: [] },
  question: { id: 'q1', kind: 'drive', text: 'How does this drive end?', opensAt: 1, locksAt: 99999, remainingMs: 10000, options: [{ id: 'TD', label: 'Touchdown', basePoints: 10 }], pickCounts: {}, status: 'open' },
};

