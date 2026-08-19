// Investment Research Agent for KhataHouse
// AI-powered stock research, comparison, and opportunity finding

import { geminiClient, AIAnalysis } from './gemini-client';
import { StockQuote, CompanyOverview } from '@/services/market';

// ============================================
// Types
// ============================================

export interface StockResearchReport {
    symbol: string;
    name: string;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
    valuation: {
        status: 'undervalued' | 'fairly_valued' | 'overvalued';
        reasoning: string;
    };
    technicalOutlook: {
        shortTerm: 'bullish' | 'bearish' | 'neutral';
        mediumTerm: 'bullish' | 'bearish' | 'neutral';
        keyLevels: {
            support: number[];
            resistance: number[];
        };
    };
    investmentThesis: string;
    targetPrice: {
        low: number;
        base: number;
        high: number;
        timeframe: string;
    };
    risks: string[];
    catalysts: string[];
    verdict: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
    confidenceScore: number;
}

export interface StockComparison {
    stocks: {
        symbol: string;
        name: string;
        score: number;
        highlights: string[];
        concerns: string[];
    }[];
    winner: string;
    comparisonFactors: {
        factor: string;
        winner: string;
        reasoning: string;
    }[];
    recommendation: string;
}

export interface InvestmentOpportunity {
    symbol: string;
    name: string;
    sector: string;
    opportunityType: 'value' | 'growth' | 'momentum' | 'dividend' | 'turnaround';
    reason: string;
    potentialReturn: string;
    riskLevel: 'low' | 'medium' | 'high';
    timeframe: string;
    confidence: number;
}

// ============================================
// Research Agent
// ============================================

class ResearchAgent {
    // Generate comprehensive stock research report
    async researchStock(
        quote: StockQuote,
        fundamentals?: CompanyOverview,
        news?: { title: string; source: string }[]
    ): Promise<AIAnalysis<StockResearchReport>> {
        const stockData = {
            symbol: quote.symbol,
            name: quote.name,
            price: quote.price,
            change: quote.change,
            changePercent: quote.changePercent,
            marketCap: quote.marketCap,
            peRatio: quote.peRatio,
            week52High: quote.week52High,
            week52Low: quote.week52Low,
            volume: quote.volume,
        };

        const prompt = `Generate a comprehensive investment research report for ${quote.name} (${quote.symbol}):

STOCK DATA:
${JSON.stringify(stockData, null, 2)}

${fundamentals ? `FUNDAMENTALS:
${JSON.stringify({
            sector: fundamentals.sector,
            industry: fundamentals.industry,
            peRatio: fundamentals.peRatio,
            eps: fundamentals.eps,
            dividendYield: fundamentals.dividendYield,
            profitMargin: fundamentals.profitMargin,
            returnOnEquity: fundamentals.returnOnEquity,
            debtToEquity: fundamentals.beta,
            revenue: fundamentals.revenue,
        }, null, 2)}` : ''}

${news ? `RECENT NEWS:
${JSON.stringify(news.slice(0, 5), null, 2)}` : ''}

Provide detailed research report in JSON:
{
  "summary": "<2-3 sentence executive summary>",
  "strengths": ["<strength 1>", ...max 4],
  "weaknesses": ["<weakness 1>", ...max 4],
  "opportunities": ["<opportunity 1>", ...max 3],
  "threats": ["<threat 1>", ...max 3],
  "valuation": {
    "status": "<undervalued|fairly_valued|overvalued>",
    "reasoning": "<valuation reasoning>"
  },
  "technicalOutlook": {
    "shortTerm": "<bullish|bearish|neutral>",
    "mediumTerm": "<bullish|bearish|neutral>",
    "keyLevels": {
      "support": [<price1>, <price2>],
      "resistance": [<price1>, <price2>]
    }
  },
  "investmentThesis": "<compelling investment thesis>",
  "targetPrice": {
    "low": <number>,
    "base": <number>,
    "high": <number>,
    "timeframe": "<12 months>"
  },
  "risks": ["<risk 1>", ...max 4],
  "catalysts": ["<catalyst 1>", ...max 3],
  "verdict": "<strong_buy|buy|hold|sell|strong_sell>",
  "confidenceScore": <number 0-100>
}

Be thorough but realistic. Consider both fundamental and technical factors.`;

        const result = await geminiClient.generateJSON<Omit<StockResearchReport, 'symbol' | 'name'>>(prompt);

        if (!result.success || !result.data) {
            return { success: false, error: result.error };
        }

        return {
            success: true,
            data: {
                symbol: quote.symbol,
                name: quote.name,
                ...result.data,
            },
        };
    }

    // Compare multiple stocks
    async compareStocks(
        stocks: { quote: StockQuote; fundamentals?: CompanyOverview }[]
    ): Promise<AIAnalysis<StockComparison>> {
        const stocksData = stocks.map((s) => ({
            symbol: s.quote.symbol,
            name: s.quote.name,
            price: s.quote.price,
            changePercent: s.quote.changePercent,
            marketCap: s.quote.marketCap,
            peRatio: s.quote.peRatio || s.fundamentals?.peRatio,
            eps: s.fundamentals?.eps,
            dividendYield: s.fundamentals?.dividendYield,
            profitMargin: s.fundamentals?.profitMargin,
            sector: s.fundamentals?.sector,
        }));

        const prompt = `Compare these stocks for investment:

STOCKS:
${JSON.stringify(stocksData, null, 2)}

Provide detailed comparison in JSON:
{
  "stocks": [
    {
      "symbol": "<symbol>",
      "name": "<name>",
      "score": <number 0-100>,
      "highlights": ["<highlight 1>", ...max 3],
      "concerns": ["<concern 1>", ...max 2]
    }
  ],
  "winner": "<symbol of best stock>",
  "comparisonFactors": [
    {
      "factor": "<valuation|growth|profitability|momentum|risk>",
      "winner": "<symbol>",
      "reasoning": "<brief reasoning>"
    }
  ],
  "recommendation": "<final recommendation paragraph>"
}

Compare on: valuation, growth potential, profitability, risk, momentum.`;

        return geminiClient.generateJSON<StockComparison>(prompt);
    }

    // Find investment opportunities based on criteria
    async findOpportunities(
        criteria: {
            investmentStyle: 'value' | 'growth' | 'dividend' | 'momentum' | 'any';
            riskTolerance: 'low' | 'medium' | 'high';
            sectors?: string[];
            maxPrice?: number;
            market: 'IN' | 'US' | 'both';
        }
    ): Promise<AIAnalysis<InvestmentOpportunity[]>> {
        const prompt = `Suggest investment opportunities based on these criteria:

CRITERIA:
- Investment Style: ${criteria.investmentStyle}
- Risk Tolerance: ${criteria.riskTolerance}
- Sectors: ${criteria.sectors?.join(', ') || 'Any'}
- Max Price: ${criteria.maxPrice || 'No limit'}
- Market: ${criteria.market === 'both' ? 'India & US' : criteria.market === 'IN' ? 'India' : 'US'}

Provide 5 investment opportunities in JSON:
[{
  "symbol": "<stock symbol with exchange suffix for Indian stocks, e.g., RELIANCE.NS>",
  "name": "<company name>",
  "sector": "<sector>",
  "opportunityType": "<value|growth|momentum|dividend|turnaround>",
  "reason": "<why this is an opportunity>",
  "potentialReturn": "<expected return range, e.g., 15-25%>",
  "riskLevel": "<low|medium|high>",
  "timeframe": "<3-6 months|6-12 months|1-2 years>",
  "confidence": <number 0-100>
}]

Suggest real, well-known stocks. Be specific with reasoning.`;

        return geminiClient.generateJSON<InvestmentOpportunity[]>(prompt);
    }

    // Explain a financial concept
    async explainConcept(topic: string): Promise<AIAnalysis<{
        title: string;
        explanation: string;
        keyPoints: string[];
        example: string;
        relatedConcepts: string[];
    }>> {
        const prompt = `Explain this financial concept in simple terms: ${topic}

Provide explanation in JSON:
{
  "title": "<concept title>",
  "explanation": "<clear 2-3 paragraph explanation for beginners>",
  "keyPoints": ["<key point 1>", ...max 5],
  "example": "<practical real-world example>",
  "relatedConcepts": ["<related concept 1>", ...max 4]
}

Make it accessible to someone new to investing. Use simple language.`;

        return geminiClient.generateJSON<{
            title: string;
            explanation: string;
            keyPoints: string[];
            example: string;
            relatedConcepts: string[];
        }>(prompt);
    }
}

// Export singleton instance
export const researchAgent = new ResearchAgent();
