// Risk Assessment Agent for KhataHouse
// AI-powered portfolio risk analysis and stress testing

import { geminiClient, AIAnalysis } from './gemini-client';
import { Holding } from '@/lib/firebase/firestore';
import { StockQuote } from '@/services/market';

// ============================================
// Types
// ============================================

export interface RiskAssessment {
    overallRiskScore: number; // 0-100, higher = riskier
    riskLevel: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
    riskFactors: {
        factor: string;
        severity: 'low' | 'medium' | 'high';
        description: string;
        mitigation: string;
    }[];
    concentrationRisk: {
        score: number;
        topHolding: { symbol: string; percentage: number };
        recommendation: string;
    };
    sectorRisk: {
        score: number;
        dominantSector: string;
        exposure: number;
        recommendation: string;
    };
    volatilityRisk: {
        score: number;
        highVolatilityHoldings: string[];
        recommendation: string;
    };
    marketRisk: {
        beta: number;
        interpretation: string;
    };
    suggestions: string[];
}

export interface StressTestResult {
    scenario: string;
    description: string;
    portfolioImpact: {
        valueChange: number;
        percentageChange: number;
    };
    mostAffectedHoldings: {
        symbol: string;
        impact: number;
    }[];
    recovery: {
        expectedTime: string;
        confidence: number;
    };
    recommendations: string[];
}

export interface RiskMetrics {
    valueAtRisk: {
        daily95: number;
        daily99: number;
        explanation: string;
    };
    maxDrawdown: {
        expected: number;
        worstCase: number;
    };
    sharpeRatio: {
        estimated: number;
        interpretation: string;
    };
}

// ============================================
// Risk Agent
// ============================================

class RiskAgent {
    // Comprehensive risk assessment
    async assessRisk(
        holdings: Holding[],
        quotes: Map<string, StockQuote>,
        totalValue: number
    ): Promise<AIAnalysis<RiskAssessment>> {
        const holdingsData = holdings.map((h) => {
            const quote = quotes.get(h.symbol);
            const value = h.quantity * (quote?.price || h.avgPrice);
            const percentage = (value / totalValue) * 100;

            return {
                symbol: h.symbol,
                name: h.name,
                type: h.type,
                value,
                percentage: percentage.toFixed(2),
                changePercent: quote?.changePercent || 0,
                week52High: quote?.week52High,
                week52Low: quote?.week52Low,
            };
        });

        const prompt = `Perform comprehensive risk assessment for this portfolio:

HOLDINGS:
${JSON.stringify(holdingsData, null, 2)}

TOTAL PORTFOLIO VALUE: ${totalValue}

Provide risk assessment in JSON:
{
  "overallRiskScore": <number 0-100>,
  "riskLevel": "<very_low|low|medium|high|very_high>",
  "riskFactors": [
    {
      "factor": "<risk factor name>",
      "severity": "<low|medium|high>",
      "description": "<description>",
      "mitigation": "<how to reduce this risk>"
    }
  ],
  "concentrationRisk": {
    "score": <number 0-100>,
    "topHolding": {"symbol": "<symbol>", "percentage": <number>},
    "recommendation": "<recommendation>"
  },
  "sectorRisk": {
    "score": <number 0-100>,
    "dominantSector": "<sector>",
    "exposure": <percentage>,
    "recommendation": "<recommendation>"
  },
  "volatilityRisk": {
    "score": <number 0-100>,
    "highVolatilityHoldings": ["<symbol1>", "<symbol2>"],
    "recommendation": "<recommendation>"
  },
  "marketRisk": {
    "beta": <estimated portfolio beta>,
    "interpretation": "<what this means>"
  },
  "suggestions": ["<suggestion 1>", ...max 5]
}

Consider: concentration, sector exposure, volatility, correlation, liquidity.`;

        return geminiClient.generateJSON<RiskAssessment>(prompt);
    }

    // Stress test portfolio under various scenarios
    async stressTest(
        holdings: Holding[],
        quotes: Map<string, StockQuote>,
        totalValue: number,
        scenario: 'market_crash' | 'sector_downturn' | 'interest_rate_hike' | 'recession' | 'custom',
        customScenario?: string
    ): Promise<AIAnalysis<StressTestResult>> {
        const holdingsData = holdings.map((h) => {
            const quote = quotes.get(h.symbol);
            return {
                symbol: h.symbol,
                name: h.name,
                type: h.type,
                value: h.quantity * (quote?.price || h.avgPrice),
            };
        });

        const scenarioDescriptions: Record<string, string> = {
            market_crash: 'A 2008-style financial crisis with 40-60% market decline',
            sector_downturn: 'Significant downturn in the dominant sector (30-40% decline)',
            interest_rate_hike: 'Aggressive interest rate increases affecting equity valuations',
            recession: 'Economic recession with prolonged market weakness',
            custom: customScenario || 'Custom stress scenario',
        };

        const prompt = `Stress test this portfolio under the following scenario:

SCENARIO: ${scenarioDescriptions[scenario]}

PORTFOLIO:
${JSON.stringify(holdingsData, null, 2)}

TOTAL VALUE: ${totalValue}

Provide stress test results in JSON:
{
  "scenario": "<scenario name>",
  "description": "<detailed scenario description>",
  "portfolioImpact": {
    "valueChange": <absolute value change>,
    "percentageChange": <percentage change, negative for losses>
  },
  "mostAffectedHoldings": [
    {"symbol": "<symbol>", "impact": <percentage impact>}
  ],
  "recovery": {
    "expectedTime": "<estimated recovery time>",
    "confidence": <number 0-100>
  },
  "recommendations": ["<recommendation 1>", ...max 4]
}

Be realistic based on historical precedents. Consider sector and asset type.`;

        return geminiClient.generateJSON<StressTestResult>(prompt);
    }

    // Calculate risk metrics
    async calculateRiskMetrics(
        holdings: Holding[],
        quotes: Map<string, StockQuote>,
        totalValue: number,
        historicalReturns?: number[]
    ): Promise<AIAnalysis<RiskMetrics>> {
        const holdingsData = holdings.map((h) => {
            const quote = quotes.get(h.symbol);
            return {
                symbol: h.symbol,
                type: h.type,
                value: h.quantity * (quote?.price || h.avgPrice),
                changePercent: quote?.changePercent || 0,
            };
        });

        const prompt = `Calculate risk metrics for this portfolio:

HOLDINGS:
${JSON.stringify(holdingsData, null, 2)}

TOTAL VALUE: ${totalValue}
${historicalReturns ? `RECENT DAILY RETURNS: ${historicalReturns.slice(0, 20).join(', ')}%` : ''}

Provide risk metrics in JSON:
{
  "valueAtRisk": {
    "daily95": <amount that could be lost in worst 5% of days>,
    "daily99": <amount that could be lost in worst 1% of days>,
    "explanation": "<what VaR means for this portfolio>"
  },
  "maxDrawdown": {
    "expected": <expected maximum drawdown percentage>,
    "worstCase": <worst case drawdown percentage>
  },
  "sharpeRatio": {
    "estimated": <estimated Sharpe ratio>,
    "interpretation": "<what this means - good/average/poor>"
  }
}

Use reasonable assumptions based on asset types and market conditions.`;

        return geminiClient.generateJSON<RiskMetrics>(prompt);
    }

    // Get personalized risk recommendations
    async getPersonalizedRecommendations(
        riskAssessment: RiskAssessment,
        userRiskTolerance: 'low' | 'medium' | 'high',
        investmentGoal: 'growth' | 'income' | 'preservation' | 'balanced'
    ): Promise<AIAnalysis<{
        alignment: 'aligned' | 'misaligned' | 'slightly_misaligned';
        analysis: string;
        adjustments: {
            action: string;
            priority: 'high' | 'medium' | 'low';
            impact: string;
        }[];
        targetAllocation: {
            assetType: string;
            currentPercentage: number;
            targetPercentage: number;
        }[];
    }>> {
        const prompt = `Provide personalized risk recommendations:

CURRENT RISK ASSESSMENT:
- Overall Risk Score: ${riskAssessment.overallRiskScore}/100
- Risk Level: ${riskAssessment.riskLevel}

USER PROFILE:
- Risk Tolerance: ${userRiskTolerance}
- Investment Goal: ${investmentGoal}

Provide recommendations in JSON:
{
  "alignment": "<aligned|misaligned|slightly_misaligned>",
  "analysis": "<analysis of alignment between portfolio risk and user profile>",
  "adjustments": [
    {
      "action": "<specific action to take>",
      "priority": "<high|medium|low>",
      "impact": "<expected impact>"
    }
  ],
  "targetAllocation": [
    {
      "assetType": "<stocks|bonds|cash|alternatives>",
      "currentPercentage": <number>,
      "targetPercentage": <number>
    }
  ]
}

Provide practical, actionable recommendations.`;

        return geminiClient.generateJSON<{
            alignment: 'aligned' | 'misaligned' | 'slightly_misaligned';
            analysis: string;
            adjustments: { action: string; priority: 'high' | 'medium' | 'low'; impact: string }[];
            targetAllocation: { assetType: string; currentPercentage: number; targetPercentage: number }[];
        }>(prompt);
    }
}

// Export singleton instance
export const riskAgent = new RiskAgent();
