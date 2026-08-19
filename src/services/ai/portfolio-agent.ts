// Portfolio Analysis Agent for KhataHouse
// AI-powered portfolio analysis, diversification scoring, and rebalancing suggestions

import { geminiClient, AIAnalysis } from './gemini-client';
import { Holding } from '@/lib/firebase/firestore';
import { StockQuote } from '@/services/market';

// ============================================
// Types
// ============================================

export interface PortfolioAnalysis {
    totalValue: number;
    totalGainLoss: number;
    totalGainLossPercent: number;
    diversificationScore: number; // 0-100
    riskLevel: 'low' | 'medium' | 'high';
    assetAllocation: {
        type: string;
        percentage: number;
        value: number;
    }[];
    sectorExposure: {
        sector: string;
        percentage: number;
    }[];
    topHoldings: {
        symbol: string;
        name: string;
        percentage: number;
        value: number;
    }[];
    insights: string[];
    suggestions: string[];
}

export interface RebalancingSuggestion {
    action: 'buy' | 'sell' | 'hold';
    symbol: string;
    name: string;
    currentWeight: number;
    targetWeight: number;
    reason: string;
    priority: 'high' | 'medium' | 'low';
}

export interface PerformancePrediction {
    timeframe: string;
    expectedReturn: {
        optimistic: number;
        base: number;
        pessimistic: number;
    };
    riskFactors: string[];
    opportunities: string[];
    confidence: number; // 0-100
}

// ============================================
// Portfolio Agent
// ============================================

class PortfolioAgent {
    // Calculate basic portfolio metrics
    calculateMetrics(
        holdings: Holding[],
        quotes: Map<string, StockQuote>
    ): {
        totalValue: number;
        totalCost: number;
        totalGainLoss: number;
        holdingValues: Map<string, number>;
    } {
        let totalValue = 0;
        let totalCost = 0;
        const holdingValues = new Map<string, number>();

        for (const holding of holdings) {
            const quote = quotes.get(holding.symbol);
            const currentPrice = quote?.price || holding.avgPrice;
            const value = holding.quantity * currentPrice;
            const cost = holding.quantity * holding.avgPrice;

            totalValue += value;
            totalCost += cost;
            holdingValues.set(holding.symbol, value);
        }

        return {
            totalValue,
            totalCost,
            totalGainLoss: totalValue - totalCost,
            holdingValues,
        };
    }

    // Analyze portfolio with AI
    async analyzePortfolio(
        holdings: Holding[],
        quotes: Map<string, StockQuote>,
        userCurrency: 'INR' | 'USD' = 'INR'
    ): Promise<AIAnalysis<PortfolioAnalysis>> {
        if (holdings.length === 0) {
            return {
                success: true,
                data: {
                    totalValue: 0,
                    totalGainLoss: 0,
                    totalGainLossPercent: 0,
                    diversificationScore: 0,
                    riskLevel: 'low',
                    assetAllocation: [],
                    sectorExposure: [],
                    topHoldings: [],
                    insights: ['Your portfolio is empty. Start by adding some holdings.'],
                    suggestions: ['Consider starting with diversified index funds or ETFs.'],
                },
            };
        }

        const metrics = this.calculateMetrics(holdings, quotes);

        // Prepare holdings data for AI
        const holdingsData = holdings.map((h) => {
            const quote = quotes.get(h.symbol);
            const value = metrics.holdingValues.get(h.symbol) || 0;
            const percentage = (value / metrics.totalValue) * 100;

            return {
                symbol: h.symbol,
                name: h.name,
                type: h.type,
                quantity: h.quantity,
                avgPrice: h.avgPrice,
                currentPrice: quote?.price || h.avgPrice,
                value,
                percentage: percentage.toFixed(2),
                change: quote?.change || 0,
                changePercent: quote?.changePercent || 0,
            };
        });

        const prompt = `Analyze this investment portfolio and provide insights:

PORTFOLIO DATA:
${JSON.stringify(holdingsData, null, 2)}

TOTAL VALUE: ${userCurrency} ${metrics.totalValue.toFixed(2)}
TOTAL GAIN/LOSS: ${userCurrency} ${metrics.totalGainLoss.toFixed(2)} (${((metrics.totalGainLoss / metrics.totalCost) * 100).toFixed(2)}%)

Provide a JSON response with this exact structure:
{
  "diversificationScore": <number 0-100>,
  "riskLevel": "<low|medium|high>",
  "assetAllocation": [{"type": "<stock|mutualfund|etf|crypto>", "percentage": <number>, "value": <number>}],
  "sectorExposure": [{"sector": "<sector name>", "percentage": <number>}],
  "insights": ["<insight 1>", "<insight 2>", ...max 5],
  "suggestions": ["<suggestion 1>", "<suggestion 2>", ...max 5]
}

Consider: concentration risk, sector diversification, asset type balance, market cap exposure.`;

        const result = await geminiClient.generateJSON<{
            diversificationScore: number;
            riskLevel: 'low' | 'medium' | 'high';
            assetAllocation: { type: string; percentage: number; value: number }[];
            sectorExposure: { sector: string; percentage: number }[];
            insights: string[];
            suggestions: string[];
        }>(prompt);

        if (!result.success || !result.data) {
            return { success: false, error: result.error };
        }

        // Build top holdings
        const topHoldings = holdingsData
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)
            .map((h) => ({
                symbol: h.symbol,
                name: h.name,
                percentage: parseFloat(h.percentage),
                value: h.value,
            }));

        return {
            success: true,
            data: {
                totalValue: metrics.totalValue,
                totalGainLoss: metrics.totalGainLoss,
                totalGainLossPercent: (metrics.totalGainLoss / metrics.totalCost) * 100,
                diversificationScore: result.data.diversificationScore,
                riskLevel: result.data.riskLevel,
                assetAllocation: result.data.assetAllocation,
                sectorExposure: result.data.sectorExposure,
                topHoldings,
                insights: result.data.insights,
                suggestions: result.data.suggestions,
            },
        };
    }

    // Get rebalancing suggestions
    async suggestRebalancing(
        holdings: Holding[],
        quotes: Map<string, StockQuote>,
        riskTolerance: 'low' | 'medium' | 'high' = 'medium'
    ): Promise<AIAnalysis<RebalancingSuggestion[]>> {
        const metrics = this.calculateMetrics(holdings, quotes);

        const holdingsData = holdings.map((h) => {
            const value = metrics.holdingValues.get(h.symbol) || 0;

            return {
                symbol: h.symbol,
                name: h.name,
                type: h.type,
                currentWeight: ((value / metrics.totalValue) * 100).toFixed(2),
                value,
            };
        });

        const prompt = `Suggest portfolio rebalancing based on this data:

CURRENT HOLDINGS:
${JSON.stringify(holdingsData, null, 2)}

TOTAL VALUE: ${metrics.totalValue}
RISK TOLERANCE: ${riskTolerance}

Provide JSON array of rebalancing suggestions:
[{
  "action": "<buy|sell|hold>",
  "symbol": "<symbol>",
  "name": "<name>",
  "currentWeight": <number>,
  "targetWeight": <number>,
  "reason": "<brief reason>",
  "priority": "<high|medium|low>"
}]

Focus on: reducing concentration risk, improving diversification, aligning with risk tolerance.
Include actionable suggestions only. Max 5 suggestions.`;

        return geminiClient.generateJSON<RebalancingSuggestion[]>(prompt);
    }

    // Predict portfolio performance
    async predictPerformance(
        holdings: Holding[],
        quotes: Map<string, StockQuote>,
        timeframe: '1m' | '3m' | '6m' | '1y' = '1y'
    ): Promise<AIAnalysis<PerformancePrediction>> {
        const holdingsData = holdings.map((h) => {
            const quote = quotes.get(h.symbol);
            return {
                symbol: h.symbol,
                name: h.name,
                type: h.type,
                currentPrice: quote?.price || h.avgPrice,
                changePercent: quote?.changePercent || 0,
                week52High: quote?.week52High,
                week52Low: quote?.week52Low,
            };
        });

        const timeframeName = {
            '1m': '1 month',
            '3m': '3 months',
            '6m': '6 months',
            '1y': '1 year',
        }[timeframe];

        const prompt = `Predict portfolio performance for the next ${timeframeName}:

HOLDINGS:
${JSON.stringify(holdingsData, null, 2)}

Provide JSON prediction:
{
  "timeframe": "${timeframeName}",
  "expectedReturn": {
    "optimistic": <percentage>,
    "base": <percentage>,
    "pessimistic": <percentage>
  },
  "riskFactors": ["<factor 1>", "<factor 2>", ...max 5],
  "opportunities": ["<opportunity 1>", ...max 3],
  "confidence": <number 0-100>
}

Consider: market trends, sector performance, historical patterns, current valuations.
Be realistic and provide reasonable expectations.`;

        return geminiClient.generateJSON<PerformancePrediction>(prompt);
    }
}

// Export singleton instance
export const portfolioAgent = new PortfolioAgent();
