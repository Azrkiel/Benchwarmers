# P15.5: continuous-tracking decision

**Current decision: NO-GO for continuous ball tracking as a product capability.** This is a prerequisite hold, not evidence that a provider was evaluated and failed.

A's measured provider evidence and B's measured interaction evidence are local to their work and unavailable here. No licensed continuous feed, timestamped observation series, provider entitlement, end-to-end freshness measurements, or demonstrated fair prediction window has been verified in C's checkout. Scripted event locations and synthetic animation tests do not supply that evidence.

`npm run qa:tracking` produces a blocked report (exit 2) with this hold decision. Keeping the gate blocked avoids promoting a plausible animation to a claim about real tracking data. Score/possession presentation may remain in the demo according to the accepted game contract; this report does not change A/B's implementation.

Before a GO review, supply:

1. A: provider identity, licensing/redistribution scope, actual observation schema, source/event/receive timestamps, sequence/gap behavior, sample duration, dropped/out-of-order rate, p50/p95/p99 end-to-end age and reproducible measurement method. Include outages and recovery; exclude keys and raw private feed content.
2. B: connected screen/command scenario using those observations, stale-data labels/hide behavior, reduced motion and keyboard behavior, actual interaction benefit, and a fair server-enforced close boundary. Synthetic observations remain labeled synthetic.
3. C: independently rerun the agreed measurements, compare with master-plan thresholds, record explicit GO/NO-GO and the exact candidate. No thresholds are invented in this report because the authoritative plan is unavailable.

Until all prerequisites are measured, the decision remains NO-GO. This is safe to hand off without seeing A/B's local files and cannot be represented as a completed provider integration.
