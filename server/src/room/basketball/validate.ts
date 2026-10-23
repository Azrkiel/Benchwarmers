import { z } from 'zod';
import { basketballEventSchema, validateBasketballEvent } from './events.js';
import { initialBasketballState, reduceBasketballEvent } from './reducer.js';
import { resolveBasketballTarget } from '../predictions/resolve.js';

const nonnegative = z.number().finite().nonnegative();
const questionSchema = z.object({
  id: z.string().min(1), templateId: z.enum(['next_score_team', 'next_made_field_goal_value', 'team_scores_in_window']),
  anchorSequence: z.number().int().positive(), horizonGameElapsedMs: nonnegative,
  teamId: z.string().min(1).optional(), allowVoid: z.boolean(),
}).strict();
const timelineSchema = z.object({
  catalog: z.object({ gameId: z.string().min(1), teamIds: z.array(z.string().min(1)).length(2), playerTeams: z.record(z.string().min(1), z.string().min(1)) }).strict(),
  finalScore: z.record(z.string().min(1), nonnegative.int()),
  beats: z.array(z.object({
    id: z.string().min(1), sequence: z.number().int().positive(), gameElapsedMs: nonnegative,
    presentationMs: nonnegative, text: z.string().min(1), event: basketballEventSchema.optional(), question: questionSchema.optional(),
  }).strict()).min(1),
}).strict();
export type BasketballTimeline = z.infer<typeof timelineSchema>;
export type ScriptedQuestionOutcome = { state: 'resolved'; optionId: string } | { state: 'void' };

/** Internal authored-script validation. Outcomes are diagnostics, never public snapshots. */
export function validateBasketballTimeline(input: unknown): BasketballTimeline & { outcomes: Record<string, ScriptedQuestionOutcome> } {
  const timeline = timelineSchema.parse(input);
  const { catalog, beats } = timeline;
  const reject = (detail: string): never => { throw new Error(`Invalid basketball timeline: ${detail}`); };
  const unique = (values: string[], label: string) => { if (new Set(values).size !== values.length) reject(`duplicate ${label}`); };
  unique(catalog.teamIds, 'team'); unique(beats.map(b => b.id), 'beat ID');
  unique(beats.flatMap(b => b.event ? [b.event.id] : []), 'event ID');
  unique(beats.flatMap(b => b.question ? [b.question.id] : []), 'question ID');
  if (Object.values(catalog.playerTeams).some(team => !catalog.teamIds.includes(team))) reject('catalog team reference');
  if (Object.keys(timeline.finalScore).length !== 2 || catalog.teamIds.some(id => !Object.hasOwn(timeline.finalScore, id))) reject('final team references');
  let state = initialBasketballState(catalog);
  let sequence = 0, elapsed = 0;
  const outcomes: Record<string, ScriptedQuestionOutcome> = Object.create(null);
  for (const [index, beat] of beats.entries()) {
    if (state.final) reject('beat after final');
    if (beat.sequence <= sequence || beat.gameElapsedMs < elapsed) reject('beat order');
    sequence = beat.sequence; elapsed = beat.gameElapsedMs;
    if (beat.event && beat.question) reject('question must precede its action');
    if (beat.event) {
      const event = validateBasketballEvent(beat.event, catalog);
      if (event.id !== beat.id || event.sequence !== beat.sequence || event.gameElapsedMs !== beat.gameElapsedMs) reject('beat/event identity');
      state = reduceBasketballEvent(state, event, catalog).state;
    }
    const question = beat.question;
    if (!question) continue;
    if (!state.possessionTeamId || question.anchorSequence !== state.appliedSequence) reject('question possession anchor');
    if (beat.presentationMs < 8000) reject('question response budget');
    if (question.horizonGameElapsedMs < beat.gameElapsedMs || question.horizonGameElapsedMs > beats.at(-1)!.gameElapsedMs) reject('question horizon');
    if (question.templateId === 'team_scores_in_window' && (!question.teamId || !catalog.teamIds.includes(question.teamId))) reject('target team');
    if (question.templateId !== 'team_scores_in_window' && question.teamId !== undefined) reject('unexpected target team');
    const following = beats.slice(index + 1);
    const nextQuestion = following.find(b => b.question);
    if (nextQuestion && question.horizonGameElapsedMs > nextQuestion.gameElapsedMs) reject('overlapping question horizons');
    const events = following.flatMap(b => b.event ? [b.event] : []);
    const result = events.map(event => resolveBasketballTarget({ ...question, eligibleParticipantIds: [] }, event)).find(result => result !== undefined);
    if (result && 'optionId' in result) outcomes[question.id] = { state: 'resolved', optionId: result.optionId };
    else if (result && question.allowVoid) outcomes[question.id] = { state: 'void' };
    else reject(`question ${question.id} cannot resolve; declare a void`);
  }
  if (!state.final || beats.at(-1)?.event?.kind !== 'final') reject('missing final');
  if (catalog.teamIds.some(id => state.score[id] !== timeline.finalScore[id])) reject('declared final score');
  return { ...timeline, outcomes };
}
