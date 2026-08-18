// AI Council Agent for FinManage
// A panel of expert personas debates a financial question, or reviews the
// user's portfolio (review board). A moderator agent then synthesizes consensus.

import { geminiClient, AIAnalysis } from './gemini-client';

// ============================================
// Types
// ============================================

export interface CouncilMember {
    id: string;
    name: string;
    role: string;
    avatarColor: string;
    persona: string;
}

export interface MemberVerdict {
    position: string;
    confidence: number; // 0-100
    reasoning: string;
    recommendation: string;
}

export interface ReviewScore {
    score: number; // 0-100
    strengths: string[];
    weaknesses: string[];
    recommendation: string;
}

export interface CouncilSynthesis {
    consensus: string[];
    disagreements: { topic: string; detail: string }[];
    verdict: string;
    voteBreakdown: { member: string; position: string; confidence: number }[];
    actionItems: string[];
}

export interface CouncilResult {
    mode: 'debate' | 'review';
    question: string;
    members: { member: CouncilMember; verdict: MemberVerdict }[];
    synthesis: CouncilSynthesis;
    generatedAt: Date;
}

export const COUNCIL_MEMBERS: CouncilMember[] = [
    {
        id: 'value',
        name: 'Aarav Mehta',
        role: 'Value Investor',
        avatarColor: '#10B981',
        persona: 'Classical value investor. Focuses on fundamentals, valuations (P/E, P/B, margins), dividend safety and margin of safety. Wary of overpaying for growth.',
    },
    {
        id: 'growth',
        name: 'Priya Sharma',
        role: 'Growth Analyst',
        avatarColor: '#8B5CF6',
        persona: 'Growth-focused analyst. Focuses on revenue/earnings growth, market tailwinds, competitive moats and upside potential, tolerating higher valuations for compounding.',
    },
    {
        id: 'risk',
        name: 'Kabir Singh',
        role: 'Risk Manager',
        avatarColor: '#EF4444',
        persona: 'Prudent risk manager. Focuses on downside protection, volatility, concentration risk, drawdowns and emergency buffers. Prefers stability over returns.',
    },
    {
        id: 'tax',
        name: 'Ananya Rao',
        role: 'Tax Advisor',
        avatarColor: '#F59E0B',
        persona: 'Indian tax specialist. Focuses on tax efficiency (LTCG/STCG on equities, ELSS, PPF, deductions under 80C, GST on expenses) and post-tax returns.',
    },
    {
        id: 'contrarian',
        name: 'Dev Patel',
        role: 'Contrarian',
        avatarColor: '#06B6D4',
        persona: 'Contrarian thinker. Actively challenges the consensus, plays devil\u2019s advocate, questions popular narratives and surfaces overlooked risks or opportunities.',
    },
];

// ============================================
// Council Agent
// ============================================

class CouncilAgent {
    private cache = new Map<string, { result: CouncilResult; expiresAt: number }>();
    private readonly cacheTtlMs = 10 * 60 * 1000;

    // Run an expert panel debate on a question
    async debate(input: { question: string; context?: string }): Promise<AIAnalysis<CouncilResult>> {
        const question = input.question.trim();
        if (!question) return { success: false, error: 'Question required' };

        const cacheKey = `debate:${question.slice(0, 120)}:${input.context?.slice(0, 500)}`;
        const cached = this.fromCache(cacheKey);
        if (cached) return { success: true, data: cached };

        const sharedPrompt = `Financial question for the user:
Q: ${question}
${input.context ? `CONTEXT:\n${input.context}` : 'CONTEXT: No additional user context provided. Answer generally.'}

Answer strictly as YOUR persona. Respond ONLY with JSON:
{
  "position": "<your position in 2-5 words, e.g. \\"Yes, with caveats\\" or \\"Too risky now\\">",
  "confidence": <0-100>,
  "reasoning": "<2-4 sentences from your perspective, referencing specific numbers/facts when available>",
  "recommendation": "<one concrete actionable recommendation>"
}`;

        const memberPromises = COUNCIL_MEMBERS.map(async (member) => {
            const result = await geminiClient.generateJSON<MemberVerdict>(
                `You are ${member.name}, ${member.role} on an AI investment council.\n\nYour investment philosophy: ${member.persona}\n\n${sharedPrompt}`
            );
            return { member, result };
        });

        const settled = await Promise.allSettled(memberPromises);
        const verdicts: { member: CouncilMember; verdict: MemberVerdict }[] = [];

        settled.forEach((entry, index) => {
            if (entry.status === 'fulfilled' && entry.value.result.success && entry.value.result.data) {
                verdicts.push({ member: entry.value.member, verdict: entry.value.result.data });
            } else {
                const member = COUNCIL_MEMBERS[index];
                verdicts.push({
                    member,
                    verdict: {
                        position: 'Could not respond',
                        confidence: 0,
                        reasoning: 'This council member failed to produce a response.',
                        recommendation: 'Retry the council session.',
                    },
                });
            }
        });

        const synthesis = await this.synthesize(question, verdicts as { member: { name: string; role: string }; verdict: MemberVerdict }[]);

        const result: CouncilResult = {
            mode: 'debate',
            question,
            members: verdicts,
            synthesis: synthesis.data || {
                consensus: [],
                disagreements: [],
                verdict: 'Council could not reach a synthesis.',
                voteBreakdown: verdicts.map((v) => ({ member: v.member.name, position: v.verdict.position, confidence: v.verdict.confidence })),
                actionItems: [],
            },
            generatedAt: new Date(),
        };

        this.toCache(cacheKey, result);
        return { success: true, data: result };
    }

    // Portfolio review board — all members grade the user's portfolio
    async reviewPortfolio(input: {
        holdings: string;
        riskSnapshot: string;
        spendingSnapshot: string;
    }): Promise<AIAnalysis<CouncilResult>> {
        const theme = 'Portfolio Health Review';
        const cacheKey = `review:${input.holdings.slice(0, 300)}:${input.riskSnapshot.slice(0, 200)}`;
        const cached = this.fromCache(cacheKey);
        if (cached) return { success: true, data: cached };

        const sharedPrompt = `Review this user's financial position strictly as YOUR persona.

HOLDINGS:
${input.holdings}

RISK SNAPSHOT:
${input.riskSnapshot}

SPENDING SNAPSHOT:
${input.spendingSnapshot || 'No spending data available.'}

Respond ONLY with JSON:
{
  "score": <0-100 portfolio health score from your perspective>,
  "strengths": ["<max 3>"],
  "weaknesses": ["<max 3>"],
  "recommendation": "<single most important action for the user>"
}`;

        const memberPromises = COUNCIL_MEMBERS.map(async (member) => {
            const result = await geminiClient.generateJSON<ReviewScore>(
                `You are ${member.name}, ${member.role} on the portfolio review board.\n\nYour philosophy: ${member.persona}\n\n${sharedPrompt}`
            );
            return { member, result };
        });

        const settled = await Promise.allSettled(memberPromises);
        const members: { member: CouncilMember; verdict: MemberVerdict }[] = [];

        settled.forEach((entry, index) => {
            const member = COUNCIL_MEMBERS[index];
            if (entry.status === 'fulfilled' && entry.value.result.success && entry.value.result.data) {
                const score = entry.value.result.data;
                members.push({
                    member,
                    verdict: {
                        position: `Score ${score.score}/100`,
                        confidence: Math.min(100, score.score),
                        reasoning: `Strengths: ${score.strengths.join('; ') || '—'}. Weaknesses: ${score.weaknesses.join('; ') || '—'}.`,
                        recommendation: score.recommendation,
                    },
                });
            } else {
                members.push({
                    member,
                    verdict: {
                        position: 'Could not respond',
                        confidence: 0,
                        reasoning: 'This council member failed to produce a response.',
                        recommendation: 'Retry the council session.',
                    },
                });
            }
        });

        const synthesis = await this.synthesize(theme, members as { member: { name: string; role: string }; verdict: MemberVerdict }[]);

        const result: CouncilResult = {
            mode: 'review',
            question: theme,
            members,
            synthesis: synthesis.data || {
                consensus: [],
                disagreements: [],
                verdict: 'Council could not reach a synthesis.',
                voteBreakdown: members.map((v) => ({ member: v.member.name, position: v.verdict.position, confidence: v.verdict.confidence })),
                actionItems: [],
            },
            generatedAt: new Date(),
        };

        this.toCache(cacheKey, result);
        return { success: true, data: result };
    }

    // Moderator: synthesize member verdicts
    private async synthesize(
        question: string,
        verdicts: { member: { name: string; role: string }; verdict: MemberVerdict }[]
    ): Promise<AIAnalysis<CouncilSynthesis>> {
        const memberText = verdicts.map((v) =>
            `- ${v.member.name} (${v.member.role}): "${v.verdict.position}" (confidence ${v.verdict.confidence}/100)\n  Reasoning: ${v.verdict.reasoning}\n  Recommendation: ${v.verdict.recommendation}`
        ).join('\n');

        const prompt = `You are the moderator of an AI investment council. Synthesize the members' views on:
"${question}"

MEMBER VERDICTS:
${memberText}

Respond ONLY with JSON:
{
  "consensus": ["<points of genuine agreement, max 4>"],
  "disagreements": [{"topic": "<point of contention>", "detail": "<what the members disagree on>"}],
  "verdict": "<balanced 2-4 sentence final council verdict>",
  "voteBreakdown": [{"member": "<name>", "position": "<position>", "confidence": <number>}],
  "actionItems": ["<top 3 practical actions for the user>"]
}

Be fair to all perspectives. The verdict must acknowledge disagreement honestly.`;

        return geminiClient.generateJSON<CouncilSynthesis>(prompt);
    }

    private fromCache(key: string): CouncilResult | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (entry.expiresAt < Date.now()) {
            this.cache.delete(key);
            return null;
        }
        return entry.result;
    }

    private toCache(key: string, result: CouncilResult): void {
        if (this.cache.size > 50) {
            const oldest = this.cache.keys().next().value;
            if (oldest) this.cache.delete(oldest);
        }
        this.cache.set(key, { result, expiresAt: Date.now() + this.cacheTtlMs });
    }
}

export const councilAgent = new CouncilAgent();